import { Switch } from "@/components/ui/switch"
import { useState, useEffect } from "react"
import { Plus, CreditCard, AlertCircle, CheckCircle2, Clock, Pencil, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { ledgerAPI } from "../../services/ledger"
import { appointmentAPI } from "../../services/appointment"

const isInsurancePaymentMethod = (method) => method === 'ins_check' || method === 'ins_eft'

export function PatientLedger({ patientId, refreshTrigger = 0, onPaymentChanged }) {
  const [transactions, setTransactions] = useState([])
  const [financialData, setFinancialData] = useState({
    aging: { '0-30': 0, '31-60': 0, '61-90': 0, '91+': 0 },
    balance: { total: 0, insurance: 0, adjust: 0, patient: 0 }
  })
  const [loading, setLoading] = useState(true)
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false)
  const [isProcedureDialogOpen, setIsProcedureDialogOpen] = useState(false)
  const [providers, setProviders] = useState([])
  const [procedureCodes, setProcedureCodes] = useState([])
  const [paymentError, setPaymentError] = useState('')

  // Payment form state
  const [paymentForm, setPaymentForm] = useState({
    date: new Date().toISOString().split('T')[0],
    amount: '',
    method: '',
    paidAtVisit: false,
    provider: '',
    appointmentId: '', 
    procedureId: ''
  })
  const [distribution, setDistribution] = useState({
    totalBalance: 0,
    insurancePortion: 0,
    patientPortion: 0
  })

  // Allocation state: maps charge id -> applied amount string
  const [allocations, setAllocations] = useState({})
  // Track which charge was selected in the "Apply to Unpaid Charge" dropdown
  const [selectedChargeId, setSelectedChargeId] = useState('')

  // Procedure form state
  const [procedureForm, setProcedureForm] = useState({
    date: new Date().toISOString().split('T')[0],
    appointmentId: '',
    procedureId: '',
    provider: '',
    code: '',
    description: '',
    amount: '',
    billToInsurance: false
  })
  const [feeLookupInfo, setFeeLookupInfo] = useState({
    loading: false,
    source: '',
    scheduleName: ''
  })

  // Edit & Delete Transaction state
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [editTransactionForm, setEditTransactionForm] = useState({
    id: null,
    type: 'CHARGE',
    originalAmount: 0,
    date: '',
    provider: '',
    code: '',
    description: '',
    amount: '',
    billToInsurance: false
  })
  const [editFeeLookupInfo, setEditFeeLookupInfo] = useState({
    loading: false,
    source: '',
    scheduleName: ''
  })
  const [editSkipInitialFeeLookup, setEditSkipInitialFeeLookup] = useState(false)
  const [savingEdit, setSavingEdit] = useState(false)
  const [deletingTransaction, setDeletingTransaction] = useState(null)
  const [deletingBusy, setDeletingBusy] = useState(false)

  // Helper to calculate total payments already applied to a specific charge
  const getPaymentsForCharge = (charge, allTransactions) => {
    if (!charge) return 0;
    return allTransactions
      .filter(t => t.amount < 0 && (
        // 1. Direct match by Charge ID tagged in payment description
        (t.description && t.description.includes(`[Charge #${charge.id}]`)) ||
        // 2. Or matching by appointmentId and procedureId
        (charge.appointmentId && t.appointmentId && String(t.appointmentId) === String(charge.appointmentId) &&
         (!charge.procedureId || !t.procedureId || String(t.procedureId) === String(charge.procedureId))) ||
        // 3. Or matching by procedureId (if charge has no appointmentId)
        (!charge.appointmentId && charge.procedureId && t.procedureId && String(t.procedureId) === String(charge.procedureId))
      ))
      .reduce((sum, p) => sum + Math.abs(p.amount), 0);
  };

  // Helper to calculate remaining balance for a charge
  const getChargeRemainingBalance = (charge, allTransactions) => {
    if (!charge) return 0;
    const paid = getPaymentsForCharge(charge, allTransactions);
    return Math.max(0, charge.amount - paid);
  };

  // Derived: only unpaid/outstanding charges that have remaining balance > 0
  const unpaidCharges = transactions
    .filter(t => t.amount > 0 && t.paymentStatus !== 'PAID')
    .map(t => ({
      ...t,
      remainingBalance: getChargeRemainingBalance(t, transactions)
    }))
    .filter(t => t.remainingBalance > 0);

  // Auto-allocate payment across unpaid charges (oldest first)
  // For insurance payments (ins_check / ins_eft), only allocate to charges that have a submitted claim.
  const calculateAutoAllocations = (paymentAmt, methodOverride = paymentForm.method) => {
    if (!paymentAmt || paymentAmt <= 0) {
      setAllocations({});
      return;
    }

    const requireClaim = isInsurancePaymentMethod(methodOverride);
    let remainingPayment = paymentAmt;
    const newAllocations = {};

    // Sort charges oldest first
    const eligibleCharges = requireClaim
      ? unpaidCharges.filter(c => c.hasSubmittedClaim)
      : unpaidCharges;
    const sortedCharges = [...eligibleCharges].sort((a, b) => new Date(a.date) - new Date(b.date));

    for (const charge of sortedCharges) {
      if (remainingPayment <= 0) break;

      const applyAmount = Math.min(charge.remainingBalance, remainingPayment);
      newAllocations[charge.id] = applyAmount.toFixed(2);
      remainingPayment -= applyAmount;
    }

    setAllocations(newAllocations);
  };

  const isInsuranceMethod = isInsurancePaymentMethod(paymentForm.method);

  // Determine if an insurance payment should be prevented because corresponding claims have not been submitted
  const getInsurancePaymentBlockReason = () => {
    if (!isInsuranceMethod) return '';

    const allocatedIds = Object.keys(allocations).filter(k => parseFloat(allocations[k]) > 0);

    if (selectedChargeId && selectedChargeId !== 'auto') {
      const targetCharge = unpaidCharges.find(t => String(t.id) === String(selectedChargeId));
      if (targetCharge && !targetCharge.hasSubmittedClaim) {
        return `Insurance payment cannot proceed: The claim for "${targetCharge.description}" (${targetCharge.date}) has not been sent yet. Please submit the claim first.`;
      }
    }

    for (const chargeId of allocatedIds) {
      const charge = unpaidCharges.find(t => String(t.id) === String(chargeId));
      if (charge && !charge.hasSubmittedClaim) {
        return `Insurance payment cannot proceed: The claim for "${charge.description}" (${charge.date}) has not been sent yet. Please submit the claim first.`;
      }
    }

    if (unpaidCharges.length === 0) {
      return 'There are no outstanding charges available for an insurance payment.';
    }

    if (unpaidCharges.every(c => !c.hasSubmittedClaim)) {
      return 'Insurance payment cannot proceed: None of the outstanding charges have a submitted claim yet. Please send the corresponding claim first.';
    }

    if (allocatedIds.length === 0) {
      return 'Please allocate the insurance payment to a charge with a submitted claim.';
    }

    return '';
  };

  const insurancePaymentBlockReason = getInsurancePaymentBlockReason();

  // Validation functions
  const isPaymentFormValid = () => {
    return paymentForm.date && 
           paymentForm.amount && 
           parseFloat(paymentForm.amount) > 0 && 
           paymentForm.method &&
           !insurancePaymentBlockReason
  }

  const isProcedureFormValid = () => {
    return procedureForm.date && 
           procedureForm.provider && 
           procedureForm.code && 
           procedureForm.amount && 
           parseFloat(procedureForm.amount) > 0
  }

  // Helper: Map payment codes/descriptions to friendly display names
  const getPaymentDescription = (t) => {
    const methods = {
      'cash': 'Cash',
      'check': 'Check',
      'cc': 'Credit Card',
      'ins_check': 'Insurance Check',
      'ins_eft': 'Insurance EFT'
    };
    if (t.description) return t.description;
    return methods[t.code] || 'Payment';
  };

const fetchTransactions = async () => {
    if (patientId) {
      setLoading(true)
      
      // Fetch ledger and distribution data concurrently
      const [ledgerData, distData] = await Promise.all([
        ledgerAPI.getPatientLedger(patientId),
        ledgerAPI.getPaymentDistribution(patientId)
      ]);
      
      if (ledgerData.transactions) {
        setTransactions(ledgerData.transactions)
      }
      if (ledgerData.financial) {
        setFinancialData(ledgerData.financial)
      }
      
      setDistribution(distData)
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTransactions()
    const loadProviders = async () => {
      if (patientId) {
        const provs = await ledgerAPI.getPatientProviders(patientId);
        setProviders(provs);

        const codes = await ledgerAPI.getPatientProcedures(patientId);
        setProcedureCodes(codes);
      }
    }
    loadProviders();
  }, [patientId, refreshTrigger])

  // Auto-populate procedure amount based on provider's fee schedule (fee_schedule_items.current_fee)
  useEffect(() => {
    let cancelled = false;

    const fetchProcedureFee = async () => {
      if (!procedureForm.provider || !procedureForm.code) {
        setFeeLookupInfo({ loading: false, source: '', scheduleName: '' });
        return;
      }

      setFeeLookupInfo({ loading: true, source: '', scheduleName: '' });
      const result = await ledgerAPI.getProcedureFee(procedureForm.provider, procedureForm.code);
      if (cancelled) return;

      if (result && result.amount !== null && result.amount !== undefined) {
        setProcedureForm(prev => ({ ...prev, amount: String(result.amount) }));
        setFeeLookupInfo({
          loading: false,
          source: result.source || 'provider_schedule',
          scheduleName: result.scheduleName || ''
        });
      } else {
        setProcedureForm(prev => ({ ...prev, amount: '' }));
        setFeeLookupInfo({ loading: false, source: 'none', scheduleName: '' });
      }
    };

    fetchProcedureFee();
    return () => { cancelled = true; };
  }, [procedureForm.provider, procedureForm.code]);

  // Auto-populate amount in Edit Transaction modal when Procedure Code or Provider changes
  useEffect(() => {
    let cancelled = false;

    if (!isEditDialogOpen) return undefined;
    if (editSkipInitialFeeLookup) {
      setEditSkipInitialFeeLookup(false);
      return undefined;
    }

    const fetchEditProcedureFee = async () => {
      if (!editTransactionForm.provider || !editTransactionForm.code) {
        setEditFeeLookupInfo({ loading: false, source: '', scheduleName: '' });
        return;
      }

      setEditFeeLookupInfo({ loading: true, source: '', scheduleName: '' });
      const result = await ledgerAPI.getProcedureFee(editTransactionForm.provider, editTransactionForm.code);
      if (cancelled) return;

      if (result && result.amount !== null && result.amount !== undefined) {
        setEditTransactionForm(prev => ({ ...prev, amount: String(result.amount) }));
        setEditFeeLookupInfo({
          loading: false,
          source: result.source || 'provider_schedule',
          scheduleName: result.scheduleName || ''
        });
      } else {
        setEditFeeLookupInfo({ loading: false, source: 'none', scheduleName: '' });
      }
    };

    fetchEditProcedureFee();
    return () => { cancelled = true; };
  }, [editTransactionForm.provider, editTransactionForm.code, isEditDialogOpen]);

  const handleOpenEditTransaction = (t) => {
    const codeStr = t.code && t.code !== '-' && t.code !== 'PMT' ? String(t.code) : (t.procedureId ? String(t.procedureId) : '');
    const matchedProc = procedureCodes.find(c => String(c.code) === codeStr);
    const autoDesc = matchedProc?.description || t.description || '';
    const dateVal = t.rawDate || (t.date && t.date !== '-' ? new Date(t.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]);

    setEditSkipInitialFeeLookup(true);
    setEditFeeLookupInfo({ loading: false, source: '', scheduleName: '' });
    setEditTransactionForm({
      id: t.id,
      type: t.type || (t.amount < 0 ? 'PAYMENT' : 'CHARGE'),
      originalAmount: t.amount,
      date: dateVal,
      provider: t.providerId ? String(t.providerId) : '',
      code: codeStr,
      description: autoDesc,
      amount: String(Math.abs(t.amount || 0)),
      billToInsurance: Boolean(t.billToInsurance)
    });
    setIsEditDialogOpen(true);
  };

  const isEditTransactionValid = () => {
    return (
      editTransactionForm.date &&
      editTransactionForm.code &&
      editTransactionForm.provider &&
      editTransactionForm.amount !== '' &&
      parseFloat(editTransactionForm.amount) > 0
    );
  };

  const handleUpdateTransactionSubmit = async () => {
    if (!editTransactionForm.id || !isEditTransactionValid() || savingEdit) return;
    setSavingEdit(true);
    const result = await ledgerAPI.updateTransaction(editTransactionForm.id, editTransactionForm);
    setSavingEdit(false);

    if (result.success) {
      setIsEditDialogOpen(false);
      await fetchTransactions();
      onPaymentChanged?.();
    } else {
      alert('Failed to update transaction: ' + result.error);
    }
  };

  const handleConfirmDeleteTransaction = async () => {
    if (!deletingTransaction || deletingBusy) return;
    setDeletingBusy(true);
    const result = await ledgerAPI.deleteTransaction(deletingTransaction.id);
    setDeletingBusy(false);

    if (result.success) {
      setDeletingTransaction(null);
      await fetchTransactions();
      onPaymentChanged?.();
    } else {
      alert('Failed to delete transaction: ' + result.error);
    }
  };

  // Handle payment submission
  const handlePaymentSubmit = async () => {
    setPaymentError('');
    if (insurancePaymentBlockReason) {
      setPaymentError(insurancePaymentBlockReason);
      return;
    }
    if (!isPaymentFormValid()) return

    const paymentAmount = parseFloat(paymentForm.amount);
    const allocKeys = Object.keys(allocations).filter(k => parseFloat(allocations[k]) > 0);

    // Prevent insurance payments from proceeding if any targeted charge lacks a submitted claim
    if (isInsuranceMethod) {
      if (allocKeys.length === 0) {
        setPaymentError('Insurance payment cannot proceed without an allocated charge that has a submitted claim.');
        return;
      }
      for (const chargeId of allocKeys) {
        const charge = unpaidCharges.find(t => String(t.id) === String(chargeId));
        if (!charge || !charge.hasSubmittedClaim) {
          setPaymentError(
            `Insurance payment cannot proceed: The claim for "${charge?.description || `Charge #${chargeId}`}" has not been submitted yet.`
          );
          return;
        }
      }
    }

    let allSuccessful = true;
    let firstError = '';

    if (allocKeys.length > 0) {
      let totalAllocated = 0;
      
      // Submit a separate payment record for each allocated charge
      for (const chargeId of allocKeys) {
        const allocAmount = parseFloat(allocations[chargeId]);
        totalAllocated += allocAmount;
        
        const charge = unpaidCharges.find(t => String(t.id) === String(chargeId));
        
        const payload = {
          ...paymentForm,
          amount: allocAmount,
          chargeId: chargeId,
          appointmentId: charge?.appointmentId || null,
          procedureId: charge?.procedureId || null,
          provider_id: charge?.providerId || null
        };
        
        const result = await ledgerAPI.addPayment(patientId, payload);
        
        if (result.success && charge) {
          const alreadyPaid = getPaymentsForCharge(charge, transactions);
          const currentBalance = charge.amount - alreadyPaid;
          const remainingAfterPayment = currentBalance - allocAmount;

          if (remainingAfterPayment <= 0.01) { 
            await ledgerAPI.updateChargeStatus(chargeId, 'PAID');
          }
        } else {
          allSuccessful = false;
          if (!firstError && result.error) firstError = result.error;
        }
      }
      
      // If the user overpaid (entered more than total unpaid) on a non-insurance payment, log remainder
      const leftover = paymentAmount - totalAllocated;
      if (leftover > 0.01 && !isInsuranceMethod) {
         const payload = {
           ...paymentForm,
           amount: leftover,
           chargeId: null,
           appointmentId: null,
           procedureId: null,
           provider_id: null
         };
         await ledgerAPI.addPayment(patientId, payload);
      }
      
    } else {
      // Generic unallocated payment (non-insurance only)
      const payload = {
        ...paymentForm,
        chargeId: null
      };
      const result = await ledgerAPI.addPayment(patientId, payload);
      if (!result.success) {
        allSuccessful = false;
        if (result.error) firstError = result.error;
      }
    }
      
    if (allSuccessful) {
      setIsPaymentDialogOpen(false)
      setPaymentError('')
      setPaymentForm({
        date: new Date().toISOString().split('T')[0],
        amount: '',
        method: '',
        paidAtVisit: false,
        provider: '',
        appointmentId: '',
        procedureId: ''
      })
      setAllocations({})
      setSelectedChargeId('auto')
      await fetchTransactions()
      onPaymentChanged?.()
    } else {
      setPaymentError(firstError || "Failed to process some or all payment allocations.");
    }
  }

  // Handle procedure submission
  const handleProcedureSubmit = async () => {
    if (!isProcedureFormValid()) return

    const result = await ledgerAPI.addCharge(patientId, procedureForm);
      
    if (result.success) {
      setIsProcedureDialogOpen(false)
      setProcedureForm({
        date: new Date().toISOString().split('T')[0],
        provider: '',
        code: '',
        description: '',
        amount: '',
        billToInsurance: false
      })
      fetchTransactions() // Refresh transactions
    } else {
      alert("Failed to add charge: " + result.error);
    }
  }

  // Calculate totals from transactions if no financial data from API
  useEffect(() => {
    if (transactions.length > 0 && financialData.balance.total === 0) {
      const total = transactions.reduce((sum, t) => sum + t.amount, 0)
      setFinancialData(prev => ({
        ...prev,
        balance: {
          total: total,
          insurance: total * 0.8,
          adjust: 0,
          patient: total * 0.2
        },
        aging: {
          '0-30': total > 0 ? total : 0,
          '31-60': 0,
          '61-90': 0,
          '91+': 0
        }
      }))
    }
  }, [transactions])

  return (
    <div className="space-y-6">
      {/* Payment Distribution Table */}
      <Card className="mb-6 border-blue-100 shadow-sm">
        <CardContent className="p-0">
          <div className="bg-slate-50 px-4 py-3 border-b">
            <h4 className="font-semibold text-slate-700">Payment Distribution</h4>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Total Balance</TableHead>
                <TableHead>Insurance Portion</TableHead>
                <TableHead>Patient Portion</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground py-4">
                    Calculating distribution...
                  </TableCell>
                </TableRow>
              ) : (
                <TableRow className="font-medium">
                  <TableCell className="text-blue-700 text-lg">
                    ₱{distribution.totalBalance.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell className="text-emerald-600 text-lg">
                    ₱{distribution.insurancePortion.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell className="text-slate-900 text-lg">
                    ₱{distribution.patientPortion.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {/* Actions Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold">Transactions</h3>
        </div>
        <div className="flex items-center gap-2">
          <Dialog open={isPaymentDialogOpen} onOpenChange={(open) => {
            setIsPaymentDialogOpen(open)
            setPaymentError('')
            if (!open) {
              setAllocations({})
              setSelectedChargeId('auto')
              setPaymentForm({
                date: new Date().toISOString().split('T')[0],
                amount: '',
                method: '',
                paidAtVisit: false,
                provider: '',
                appointmentId: '',
                procedureId: ''
              })
            }
          }}>
            <DialogTrigger asChild>
              <Button variant="outline" className="border-blue-200 text-[#66BAFF] hover:bg-blue-50 bg-transparent">
                <CreditCard className="w-4 h-4 mr-2" />
                Payment
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Enter Payment</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Payment Date <span className="text-red-500">*</span></Label>
                    <Input 
                      type="date" 
                      value={paymentForm.date}
                      onChange={(e) => setPaymentForm({ ...paymentForm, date: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Amount <span className="text-red-500">*</span></Label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-muted-foreground">₱</span>
                      <Input 
                        className="pl-7" 
                        placeholder="0.00"
                        type="number"
                        step="0.01"
                        value={paymentForm.amount}
                        onChange={(e) => {
                          const val = e.target.value;
                          setPaymentForm(prev => ({ ...prev, amount: val }));
                          
                          const numVal = parseFloat(val) || 0;
                          if (selectedChargeId && selectedChargeId !== 'auto') {
                            // If a specific charge is targeted, dump the whole amount there
                            setAllocations({ [selectedChargeId]: val });
                          } else {
                            // Otherwise, run the waterfall allocation
                            calculateAutoAllocations(numVal);
                          }
                        }}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Method <span className="text-red-500">*</span></Label>
                    <Select
                      value={paymentForm.method}
                      onValueChange={(value) => {
                        setPaymentError('');
                        setPaymentForm(prev => ({ ...prev, method: value }));
                        const numVal = parseFloat(paymentForm.amount) || 0;
                        if (!selectedChargeId || selectedChargeId === 'auto') {
                          calculateAutoAllocations(numVal, value);
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select method" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="check">Check</SelectItem>
                        <SelectItem value="cc">Credit Card</SelectItem>
                        <SelectItem value="ins_check">Insurance Check</SelectItem>
                        <SelectItem value="ins_eft">Insurance EFT</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end pb-2">
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id="visit"
                        checked={paymentForm.paidAtVisit}
                        onCheckedChange={(checked) => setPaymentForm({ ...paymentForm, paidAtVisit: checked })}
                      />
                      <Label htmlFor="visit">Paid at patient visit</Label>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Allocation Method</Label>
                  <Select
                    value={selectedChargeId || 'auto'}
                    onValueChange={(val) => {
                      setSelectedChargeId(val);
                      const currentAmt = parseFloat(paymentForm.amount) || 0;

                      if (val === 'auto') {
                        // Re-run auto allocation
                        calculateAutoAllocations(currentAmt);
                        setPaymentForm(prev => ({ ...prev, appointmentId: '', procedureId: '', provider_id: '' }));
                      } else {
                        // Single charge allocation
                        const charge = unpaidCharges.find(t => String(t.id) === String(val));
                        const amtToUse = paymentForm.amount && parseFloat(paymentForm.amount) > 0
                          ? paymentForm.amount
                          : (charge ? String(charge.remainingBalance) : '');

                        setPaymentForm(prev => ({ 
                          ...prev, 
                          amount: amtToUse,
                          appointmentId: charge?.appointmentId || '',
                          procedureId: charge?.procedureId || '',
                          provider_id: charge?.providerId || '' 
                        }));

                        if (amtToUse) {
                          setAllocations({ [val]: amtToUse });
                        } else {
                          setAllocations({});
                        }
                      }
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select an allocation method..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Auto-allocate (Oldest First)</SelectItem>
                      {unpaidCharges.map((t) => (
                        <SelectItem key={t.id} value={String(t.id)}>
                          {t.date} - {t.description} (₱{t.remainingBalance.toLocaleString('en-PH', { minimumFractionDigits: 2 })}) — {t.hasSubmittedClaim ? `Claim: ${t.claimStatus}` : 'No Claim Sent'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Allocation Section presenting updated charge, claim status, and auto-populated applied column */}
                <div className="border rounded-lg p-4 bg-slate-50 overflow-x-auto">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium text-sm">Allocation</h4>
                    {isInsuranceMethod && (
                      <span className="text-xs text-slate-600">
                        Insurance payments can only be applied to charges with a submitted claim.
                      </span>
                    )}
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Code</TableHead>
                        <TableHead>Claim Status</TableHead>
                        <TableHead>Updated Charge</TableHead>
                        <TableHead>Applied</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {unpaidCharges.map((t) => {
                        const blockedByUnsentClaim = isInsuranceMethod && !t.hasSubmittedClaim;
                        return (
                          <TableRow 
                            key={t.id} 
                            className={String(t.id) === selectedChargeId ? 'bg-blue-50/80 font-medium' : blockedByUnsentClaim ? 'opacity-65' : ''}
                          >
                            <TableCell className="whitespace-nowrap">{t.date}</TableCell>
                            <TableCell className="whitespace-nowrap">{t.code}</TableCell>
                            <TableCell className="whitespace-nowrap">
                              {t.hasSubmittedClaim ? (
                                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs">
                                  <CheckCircle2 className="w-3 h-3 mr-1" />
                                  {t.claimStatus || 'Submitted'}
                                </Badge>
                              ) : t.billToInsurance === false ? (
                                <Badge variant="outline" className="bg-slate-100 text-slate-600 border-slate-200 text-xs">
                                  Self-Pay
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-xs">
                                  <Clock className="w-3 h-3 mr-1" />
                                  Not Sent
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-slate-900 font-medium whitespace-nowrap">
                              ₱{t.remainingBalance.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                            </TableCell>
                            <TableCell>
                              <Input
                                className="h-8 w-28 bg-white"
                                placeholder="0.00"
                                type="number"
                                step="0.01"
                                value={allocations[t.id] || ''}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setPaymentError('');
                                  setAllocations({ [t.id]: val });
                                  setSelectedChargeId(String(t.id));
                                  setPaymentForm(prev => ({
                                    ...prev,
                                    amount: val,
                                    appointmentId: t.appointmentId || '',
                                    procedureId: t.procedureId || '',
                                    provider_id: t.providerId || ''
                                  }));
                                }}
                              />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {unpaidCharges.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground text-sm">
                            No outstanding charges
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>

                {(insurancePaymentBlockReason || paymentError) && (
                  <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
                    <span>{paymentError || insurancePaymentBlockReason}</span>
                  </div>
                )}

                <div className="flex justify-end pt-2">
                  <Button 
                    className="w-full sm:w-auto"
                    onClick={handlePaymentSubmit}
                    disabled={!isPaymentFormValid()}
                  >
                    Post Payment
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={isProcedureDialogOpen} onOpenChange={(open) => {
            setIsProcedureDialogOpen(open);
            if (!open) {
              setProcedureForm({
                date: new Date().toISOString().split('T')[0],
                appointmentId: '',
                procedureId: '',
                provider: '',
                code: '',
                description: '',
                amount: '',
                billToInsurance: false
              });
              setFeeLookupInfo({ loading: false, source: '', scheduleName: '' });
            }
          }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Procedure
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Procedure</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="space-y-2">
                  <Label>Date <span className="text-red-500">*</span></Label>
                  <Input 
                    type="date"
                    value={procedureForm.date}
                    onChange={(e) => setProcedureForm({ ...procedureForm, date: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Provider <span className="text-red-500">*</span></Label>
                  <Select
                    value={procedureForm.provider ? String(procedureForm.provider) : ''}
                    onValueChange={(value) => setProcedureForm(prev => ({ ...prev, provider: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select Provider" />
                    </SelectTrigger>
                    <SelectContent>
                      {providers.map((p) => (
                        <SelectItem key={p.id} value={String(p.id)}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Procedure Code <span className="text-red-500">*</span></Label>
                  <Select
                    value={procedureForm.code}
                    onValueChange={(val) => {
                      const selected = procedureCodes.find(c => String(c.code) === String(val));
                      const autoDesc = selected?.description || `Procedure #${val}`;
                      setProcedureForm({ 
                        ...procedureForm, 
                        code: val,
                        procedureId: val,
                        appointmentId: selected?.appointmentId || '',
                        description: autoDesc
                      });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select Procedure Code" />
                    </SelectTrigger>
                    <SelectContent>
                      {procedureCodes.length > 0 ? (
                        procedureCodes.map((item) => (
                          <SelectItem key={item.code} value={String(item.code)}>
                            {item.description && item.description !== String(item.code)
                              ? `${item.code} - ${item.description}`
                              : item.code}
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem value="none" disabled>
                          No procedures found
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Input 
                    placeholder="Procedure description..."
                    value={procedureForm.description}
                    onChange={(e) => setProcedureForm({ ...procedureForm, description: e.target.value })}
                  />
                </div>
                <div className="flex items-center justify-between py-2">
                  <Label>Bill to Insurance</Label>
                  <Switch 
                    checked={procedureForm.billToInsurance}
                    onCheckedChange={(checked) => setProcedureForm({ ...procedureForm, billToInsurance: checked })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Amount <span className="text-red-500">*</span></Label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-muted-foreground">₱</span>
                    <Input 
                      className="pl-7" 
                      placeholder={feeLookupInfo.loading ? "Loading fee..." : "0.00"}
                      type="number"
                      step="0.01"
                      value={procedureForm.amount}
                      onChange={(e) => setProcedureForm(prev => ({ ...prev, amount: e.target.value }))}
                    />
                  </div>
                  {feeLookupInfo.loading && (
                    <p className="text-xs text-muted-foreground">Looking up fee schedule rate...</p>
                  )}
                  {!feeLookupInfo.loading && feeLookupInfo.source === 'provider_schedule' && (
                    <p className="text-xs text-blue-600">
                      Auto-filled from provider&apos;s fee schedule{feeLookupInfo.scheduleName ? ` (${feeLookupInfo.scheduleName})` : ''}.
                    </p>
                  )}
                  {!feeLookupInfo.loading && feeLookupInfo.source === 'standard_schedule' && (
                    <p className="text-xs text-muted-foreground">
                      Auto-filled from clinic fee schedule{feeLookupInfo.scheduleName ? ` (${feeLookupInfo.scheduleName})` : ''}.
                    </p>
                  )}
                  {!feeLookupInfo.loading && feeLookupInfo.source === 'none' && procedureForm.provider && procedureForm.code && (
                    <p className="text-xs text-amber-600">
                      No rate found in the provider&apos;s fee schedule for this procedure. You can enter the amount manually.
                    </p>
                  )}
                </div>
                <Button 
                  onClick={handleProcedureSubmit}
                  disabled={!isProcedureFormValid()}
                >
                  Save Charge
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
                      
      {/* Ledger Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Claim Status</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    Loading transactions...
                  </TableCell>
                </TableRow>
              ) : transactions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    No transactions found
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {transactions.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell>{t.date}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{t.created}</TableCell>
                      
                      {/* Code Column: Show 'PMT' for payments, otherwise show procedure code */}
                      <TableCell className="font-mono text-sm">
                        {t.amount < 0 ? "PMT" : t.code}
                      </TableCell>
                      
                      {/* Description Column: Show friendly description */}
                      <TableCell>
                        {t.amount < 0 ? getPaymentDescription(t) : t.description}
                      </TableCell>
                      
                      <TableCell>{t.provider}</TableCell>
                      <TableCell>
                        {t.amount < 0 ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : t.claimStatus ? (
                          <Badge
                            variant="outline"
                            className={
                              String(t.claimStatus).toUpperCase() === 'DENIED'
                                ? 'bg-red-50 text-red-700 border-red-200 text-xs'
                                : String(t.claimStatus).toUpperCase() === 'APPROVED' || String(t.claimStatus).toUpperCase() === 'PAID'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 text-xs'
                                  : 'bg-blue-50 text-blue-700 border-blue-200 text-xs'
                            }
                          >
                            {t.claimStatus}
                          </Badge>
                        ) : t.billToInsurance === false ? (
                          <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200 text-xs">
                            Self-Pay
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-xs">
                            Not Sent
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className={`text-right font-medium ${t.amount < 0 ? "text-green-600" : "text-slate-900"}`}>
                        {t.amount < 0 ? "(" : ""}₱{Math.abs(t.amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                        {t.amount < 0 ? ")" : ""}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex items-center justify-end gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-slate-600 hover:text-blue-600 hover:bg-blue-50"
                            title="Edit transaction"
                            aria-label="Edit transaction"
                            onClick={() => handleOpenEditTransaction(t)}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                            title="Delete transaction"
                            aria-label="Delete transaction"
                            onClick={() => setDeletingTransaction(t)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  
                </>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Edit Transaction Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={(open) => {
        if (!savingEdit) setIsEditDialogOpen(open)
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Ledger Transaction</DialogTitle>
            <DialogDescription>
              Update the date, procedure code, and provider. Description and amount automatically update based on your selection.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Date <span className="text-red-500">*</span></Label>
              <Input
                type="date"
                value={editTransactionForm.date}
                onChange={(e) => setEditTransactionForm(prev => ({ ...prev, date: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Provider <span className="text-red-500">*</span></Label>
              <Select
                value={editTransactionForm.provider ? String(editTransactionForm.provider) : ''}
                onValueChange={(value) => setEditTransactionForm(prev => ({ ...prev, provider: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select Provider" />
                </SelectTrigger>
                <SelectContent>
                  {providers.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Procedure Code <span className="text-red-500">*</span></Label>
              <Select
                value={editTransactionForm.code ? String(editTransactionForm.code) : ''}
                onValueChange={(val) => {
                  const selected = procedureCodes.find(c => String(c.code) === String(val));
                  const autoDesc = selected?.description || `Procedure #${val}`;
                  setEditTransactionForm(prev => ({
                    ...prev,
                    code: val,
                    description: autoDesc
                  }));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select Procedure Code" />
                </SelectTrigger>
                <SelectContent>
                  {procedureCodes.length > 0 ? (
                    procedureCodes.map((item) => (
                      <SelectItem key={item.code} value={String(item.code)}>
                        {item.description && item.description !== String(item.code)
                          ? `${item.code} - ${item.description}`
                          : item.code}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="none" disabled>
                      No procedures found
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Description (Auto-populated from Code)</Label>
              <Input
                readOnly
                className="bg-slate-50"
                placeholder="Procedure description..."
                value={editTransactionForm.description}
              />
            </div>

            {editTransactionForm.type !== 'PAYMENT' && editTransactionForm.originalAmount >= 0 && (
              <div className="flex items-center justify-between py-2">
                <Label>Bill to Insurance</Label>
                <Switch
                  checked={editTransactionForm.billToInsurance}
                  onCheckedChange={(checked) => setEditTransactionForm(prev => ({ ...prev, billToInsurance: checked }))}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label>Amount <span className="text-red-500">*</span></Label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-muted-foreground">₱</span>
                <Input
                  className="pl-7"
                  placeholder={editFeeLookupInfo.loading ? "Loading fee..." : "0.00"}
                  type="number"
                  step="0.01"
                  value={editTransactionForm.amount}
                  onChange={(e) => setEditTransactionForm(prev => ({ ...prev, amount: e.target.value }))}
                />
              </div>
              {editFeeLookupInfo.loading && (
                <p className="text-xs text-muted-foreground">Looking up fee schedule rate...</p>
              )}
              {!editFeeLookupInfo.loading && editFeeLookupInfo.source === 'provider_schedule' && (
                <p className="text-xs text-blue-600">
                  Auto-filled from provider&apos;s fee schedule{editFeeLookupInfo.scheduleName ? ` (${editFeeLookupInfo.scheduleName})` : ''}.
                </p>
              )}
              {!editFeeLookupInfo.loading && editFeeLookupInfo.source === 'standard_schedule' && (
                <p className="text-xs text-muted-foreground">
                  Auto-filled from clinic fee schedule{editFeeLookupInfo.scheduleName ? ` (${editFeeLookupInfo.scheduleName})` : ''}.
                </p>
              )}
              {!editFeeLookupInfo.loading && editFeeLookupInfo.source === 'none' && editTransactionForm.provider && editTransactionForm.code && (
                <p className="text-xs text-amber-600">
                  No rate found in the provider&apos;s fee schedule for this procedure. You can enter the amount manually.
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" disabled={savingEdit} onClick={() => setIsEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleUpdateTransactionSubmit} disabled={!isEditTransactionValid() || savingEdit}>
                {savingEdit ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Transaction Confirmation Dialog */}
      <Dialog open={deletingTransaction !== null} onOpenChange={(open) => {
        if (!open && !deletingBusy) setDeletingTransaction(null)
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Ledger Transaction</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <span className="font-semibold text-slate-900">{deletingTransaction?.description}</span> ({deletingTransaction?.date}) for <span className="font-semibold text-slate-900">₱{Math.abs(deletingTransaction?.amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" disabled={deletingBusy} onClick={() => setDeletingTransaction(null)}>
              Cancel
            </Button>
            <Button className="bg-red-600 hover:bg-red-700 text-white" disabled={deletingBusy} onClick={handleConfirmDeleteTransaction}>
              {deletingBusy ? 'Deleting...' : 'Delete Transaction'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
