import { Switch } from "@/components/ui/switch"
import { useState, useEffect } from "react"
import { Plus, CreditCard } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { ledgerAPI } from "../../services/ledger"
import { appointmentAPI } from "../../services/appointment"

export function PatientLedger({ patientId }) {
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
  const calculateAutoAllocations = (paymentAmt) => {
    if (!paymentAmt || paymentAmt <= 0) {
      setAllocations({});
      return;
    }

    let remainingPayment = paymentAmt;
    const newAllocations = {};

    // Sort charges oldest first
    const sortedCharges = [...unpaidCharges].sort((a, b) => new Date(a.date) - new Date(b.date));

    for (const charge of sortedCharges) {
      if (remainingPayment <= 0) break;

      const applyAmount = Math.min(charge.remainingBalance, remainingPayment);
      newAllocations[charge.id] = applyAmount.toFixed(2);
      remainingPayment -= applyAmount;
    }

    setAllocations(newAllocations);
  };

  // Validation functions
  const isPaymentFormValid = () => {
    return paymentForm.date && 
           paymentForm.amount && 
           parseFloat(paymentForm.amount) > 0 && 
           paymentForm.method
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
  }, [patientId])

  // Auto-populate procedure amount based on provider's fee schedule
  useEffect(() => {
    const fetchProcedureFee = async () => {
      if (procedureForm.provider && procedureForm.code) {
        const fee = await ledgerAPI.getProcedureFee(procedureForm.provider, procedureForm.code);
        if (fee) {
          setProcedureForm(prev => ({ ...prev, amount: fee.toString() }));
        }
      }
    };
    
    fetchProcedureFee();
  }, [procedureForm.provider, procedureForm.code]);

  // Handle payment submission
  const handlePaymentSubmit = async () => {
    if (!isPaymentFormValid()) return

    const paymentAmount = parseFloat(paymentForm.amount);
    const allocKeys = Object.keys(allocations).filter(k => parseFloat(allocations[k]) > 0);

    let allSuccessful = true;

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
        }
      }
      
      // If the user overpaid (entered more than total unpaid), log the remainder as generic payment
      const leftover = paymentAmount - totalAllocated;
      if (leftover > 0.01) {
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
      // Generic unallocated payment
      const payload = {
        ...paymentForm,
        chargeId: null
      };
      const result = await ledgerAPI.addPayment(patientId, payload);
      if (!result.success) allSuccessful = false;
    }
      
    if (allSuccessful) {
      setIsPaymentDialogOpen(false)
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
      fetchTransactions() 
    } else {
      alert("Failed to process some or all payment allocations.");
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
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Enter Payment</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
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
                      onValueChange={(value) => setPaymentForm({ ...paymentForm, method: value })}
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

                <div className="space-y-2 col-span-2">
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
                    <SelectTrigger>
                      <SelectValue placeholder="Select an allocation method..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Auto-allocate (Oldest First)</SelectItem>
                      {unpaidCharges.map((t) => (
                        <SelectItem key={t.id} value={String(t.id)}>
                          {t.date} - {t.description} (₱{t.remainingBalance.toLocaleString('en-PH', { minimumFractionDigits: 2 })})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Allocation Section presenting updated charge and auto-populated applied column */}
                <div className="border rounded-lg p-4 mt-2 bg-slate-50">
                  <h4 className="font-medium mb-2 text-sm">Allocation</h4>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Code</TableHead>
                        <TableHead>Updated Charge</TableHead>
                        <TableHead>Applied</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {unpaidCharges.map((t) => (
                        <TableRow 
                          key={t.id} 
                          className={String(t.id) === selectedChargeId ? 'bg-blue-50/80 font-medium' : ''}
                        >
                          <TableCell>{t.date}</TableCell>
                          <TableCell>{t.code}</TableCell>
                          <TableCell className="text-slate-900 font-medium">
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
                      ))}
                      {unpaidCharges.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center text-muted-foreground text-sm">
                            No outstanding charges
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>

                <Button 
                  onClick={handlePaymentSubmit}
                  disabled={!isPaymentFormValid()}
                >
                  Post Payment
                </Button>
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
                    value={procedureForm.provider}
                    onValueChange={(value) => setProcedureForm({ ...procedureForm, provider: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select Provider" />
                    </SelectTrigger>
                    <SelectContent>
                      {providers.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
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
                      placeholder="0.00"
                      type="number"
                      step="0.01"
                      value={procedureForm.amount}
                      onChange={(e) => setProcedureForm({ ...procedureForm, amount: e.target.value })}
                    />
                  </div>
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
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    Loading transactions...
                  </TableCell>
                </TableRow>
              ) : transactions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
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
                      <TableCell className={`text-right font-medium ${t.amount < 0 ? "text-green-600" : "text-slate-900"}`}>
                        {t.amount < 0 ? "(" : ""}₱{Math.abs(t.amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                        {t.amount < 0 ? ")" : ""}
                      </TableCell>
                    </TableRow>
                  ))}
                  
                </>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
