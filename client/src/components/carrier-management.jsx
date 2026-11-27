import { useState, useEffect } from "react"
import { Plus, ShieldCheck, ArrowLeft, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { POSTGabayAPI } from "../../services/postGabayApi" // Import API

export function CarrierManagement({ carriers = [], loading = false, onRefresh }) {
  // Calculate active carriers from the passed data
  const activeCarriersCount = carriers.filter(c => c.status === 'ACTIVE').length

  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingCarrierId, setEditingCarrierId] = useState(null)
  const [isAddPlanDialogOpen, setIsAddPlanDialogOpen] = useState(false)
  const [isEditPlanDialogOpen, setIsEditPlanDialogOpen] = useState(false)
  const [currentTab, setCurrentTab] = useState("basic")
  const [viewMode, setViewMode] = useState("list") // "list" or "manage"
  const [selectedCarrier, setSelectedCarrier] = useState(null)
  const [editingPlan, setEditingPlan] = useState(null)
  const [deletingCarrier, setDeletingCarrier] = useState(null)
  const [deletingPlan, setDeletingPlan] = useState(null)
  const [deletingBusy, setDeletingBusy] = useState(false)

  // Keep selectedCarrier in sync whenever carriers list refreshes
  useEffect(() => {
    if (selectedCarrier?.id && Array.isArray(carriers)) {
      const updated = carriers.find(c => c.id === selectedCarrier.id)
      if (updated) {
        setSelectedCarrier(updated)
      }
    }
  }, [carriers])
  
  // Form Data for New / Edited Carrier
  const [formData, setFormData] = useState({
    carrierName: "",
    planName: "",
    streetAddress: "",
    city: "",
    province: "",
    zipCode: "",
    payerId: "",
    accreditationNumber: "",
    expirationDate: ""
  })

  // Form Data for New Plan
  const [newPlanData, setNewPlanData] = useState({
    planName: "",
    renewalMonth: "January",
    type: "medical",
    deductible: "",
    maxLimit: "",
    coPayAmount: "",
    coPayType: "fixed"
  })

  // Form Data for Editing an Existing Plan
  const [editPlanData, setEditPlanData] = useState({
    planName: "",
    renewalMonth: "January",
    type: "medical",
    deductible: "",
    maxLimit: "",
    coPayAmount: "",
    coPayType: "fixed"
  })

  const handleInputChange = (field, value) => {
    // Validate input based on field type
    let validatedValue = value

    switch (field) {
      case 'carrierName':
      case 'planName':
      case 'city':
      case 'province':
        // Only allow letters, spaces, and common punctuation
        validatedValue = value.replace(/[^a-zA-Z\s.,'-]/g, '')
        break
      case 'zipCode':
        // Only allow numbers, limit to 4 digits (Philippine zip codes)
        validatedValue = value.replace(/[^0-9]/g, '').slice(0, 4)
        break
      case 'payerId':
      case 'accreditationNumber':
        // Allow alphanumeric and hyphens
        validatedValue = value.replace(/[^a-zA-Z0-9-]/g, '').toUpperCase()
        break
      case 'streetAddress':
        // Allow alphanumeric, spaces, and common address characters
        validatedValue = value.replace(/[^a-zA-Z0-9\s.,#-]/g, '')
        break
    }

    setFormData(prev => ({ ...prev, [field]: validatedValue }))
  }

  const isBasicInfoValid = () => {
    return formData.carrierName.trim().length >= 2 && formData.planName.trim().length >= 2
  }

  const isAddressValid = () => {
    return formData.streetAddress.trim().length >= 5 && 
           formData.city.trim().length >= 2 && 
           formData.province.trim().length >= 2 && 
           formData.zipCode.length === 4 && 
           formData.payerId.trim().length >= 3
  }

  const isPhilHealthValid = () => {
    const today = new Date().toISOString().split('T')[0]
    return formData.accreditationNumber.trim().length >= 5 && 
           formData.expirationDate.trim() !== "" &&
           formData.expirationDate >= today
  }

  const handleNext = () => {
    if (currentTab === "basic" && isBasicInfoValid()) {
      setCurrentTab("address")
    } else if (currentTab === "address" && isAddressValid()) {
      setCurrentTab("philhealth")
    }
  }

  const handleOpenAddCarrier = () => {
    setEditingCarrierId(null)
    setFormData({
      carrierName: "",
      planName: "",
      streetAddress: "",
      city: "",
      province: "",
      zipCode: "",
      payerId: "",
      accreditationNumber: "",
      expirationDate: ""
    })
    setCurrentTab("basic")
    setIsDialogOpen(true)
  }

  const handleOpenEditCarrier = (carrier) => {
    setEditingCarrierId(carrier.id)
    setFormData({
      carrierName: carrier.name || "",
      planName: carrier.type || "",
      streetAddress: carrier.street_address || carrier.address || "",
      city: carrier.city || "",
      province: carrier.province || "",
      zipCode: String(carrier.zip_code || ""),
      payerId: carrier.payer_id || "",
      accreditationNumber: carrier.accreditation_number || "",
      expirationDate: carrier.accreditation_expiration ? String(carrier.accreditation_expiration).slice(0, 10) : ""
    })
    setCurrentTab("basic")
    setIsDialogOpen(true)
  }

  const handleSaveCarrier = async () => {
    if (!isPhilHealthValid()) {
      alert('Please fill all required fields correctly')
      return
    }

    const result = editingCarrierId
      ? await POSTGabayAPI.updateInsuranceCarrier(editingCarrierId, formData)
      : await POSTGabayAPI.createInsuranceCarrier(formData);

    if (result.success) {
      alert(editingCarrierId ? 'Carrier updated successfully!' : 'Carrier saved successfully!');
      
      // Reset form and close dialog
      setFormData({
        carrierName: "",
        planName: "",
        streetAddress: "",
        city: "",
        province: "",
        zipCode: "",
        payerId: "",
        accreditationNumber: "",
        expirationDate: ""
      })
      setEditingCarrierId(null)
      setCurrentTab("basic")
      setIsDialogOpen(false)
      if (onRefresh) await onRefresh(); // Auto-refresh list immediately
    } else {
      alert('Failed to save carrier: ' + result.error);
    }
  }

  const handleSavePlan = async () => {
    if (!newPlanData.planName || !selectedCarrier) return;

    const payload = {
      carrierId: selectedCarrier.id, // Ensure selectedCarrier has ID
      ...newPlanData
    };

    const result = await POSTGabayAPI.createInsurancePlan(payload);

    if (result.success) {
      alert('Plan added successfully!');
      setIsAddPlanDialogOpen(false);
      setNewPlanData({
        planName: "",
        renewalMonth: "January",
        type: "medical",
        deductible: "",
        maxLimit: "",
        coPayAmount: "",
        coPayType: "fixed"
      });
      if (onRefresh) await onRefresh();
    } else {
      alert('Failed to add plan: ' + result.error);
    }
  }

  const handleOpenEditPlan = (plan) => {
    const planId = plan.insurance_id ?? plan.plan_id ?? plan.id
    setEditingPlan({ ...plan, id: planId })
    setEditPlanData({
      planName: plan.plan_name || "",
      renewalMonth: plan.renewal_month || "January",
      type: (plan.type || "medical").toLowerCase(),
      deductible: plan.deductible != null ? String(plan.deductible) : "",
      maxLimit: plan.max_limit != null ? String(plan.max_limit) : "",
      coPayAmount: plan.copay_amount != null ? String(plan.copay_amount) : "",
      coPayType: plan.copay_type || "fixed"
    })
    setIsEditPlanDialogOpen(true)
  }

  const handleUpdatePlan = async () => {
    if (!editingPlan?.id || !editPlanData.planName.trim()) {
      alert('Plan name is required.')
      return
    }

    const result = await POSTGabayAPI.updateInsurancePlan(editingPlan.id, editPlanData)
    if (result.success) {
      alert('Plan updated successfully!')
      setIsEditPlanDialogOpen(false)
      setEditingPlan(null)
      if (onRefresh) await onRefresh()
    } else {
      alert('Failed to update plan: ' + result.error)
    }
  }

  const handleConfirmDeleteCarrier = async () => {
    if (!deletingCarrier || deletingBusy) return
    setDeletingBusy(true)
    const result = await POSTGabayAPI.deleteInsuranceCarrier(deletingCarrier.id)
    setDeletingBusy(false)

    if (result.success) {
      if (selectedCarrier?.id === deletingCarrier.id) {
        setSelectedCarrier(null)
        setViewMode("list")
      }
      setDeletingCarrier(null)
      if (onRefresh) await onRefresh()
    } else {
      alert('Failed to delete carrier: ' + result.error)
    }
  }

  const handleConfirmDeletePlan = async () => {
    if (!deletingPlan || deletingBusy) return
    const planId = deletingPlan.insurance_id ?? deletingPlan.plan_id ?? deletingPlan.id
    setDeletingBusy(true)
    const result = await POSTGabayAPI.deleteInsurancePlan(planId)
    setDeletingBusy(false)

    if (result.success) {
      setDeletingPlan(null)
      if (onRefresh) await onRefresh()
    } else {
      alert('Failed to delete plan: ' + result.error)
    }
  }

  const handleCancel = () => {
    setFormData({
      carrierName: "",
      planName: "",
      streetAddress: "",
      city: "",
      province: "",
      zipCode: "",
      payerId: "",
      accreditationNumber: "",
      expirationDate: ""
    })
    setEditingCarrierId(null)
    setCurrentTab("basic")
    setIsDialogOpen(false)
  }

  return (
    <div className="space-y-6">
      {/* Fixed Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Carrier Management</h1>
          <p className="text-muted-foreground">Manage insurance providers and coverage plans</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open)
          if (!open) setEditingCarrierId(null)
        }}>
          <DialogTrigger asChild>
            <Button className="bg-blue-500 hover:bg-blue-600" onClick={handleOpenAddCarrier}>
              <Plus className="w-4 h-4 mr-2" />
              Add Carrier
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingCarrierId ? "Edit Carrier" : "Add New Carrier"}</DialogTitle>
            </DialogHeader>
            <Tabs value={currentTab} onValueChange={setCurrentTab} className="mt-4">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="basic">Basic Info</TabsTrigger>
                <TabsTrigger value="address" disabled={!isBasicInfoValid()}>
                  Address & Payer ID
                </TabsTrigger>
                <TabsTrigger value="philhealth" disabled={!isBasicInfoValid() || !isAddressValid()}>
                  PhilHealth
                </TabsTrigger>
              </TabsList>
              <TabsContent value="basic" className="space-y-4 py-4">
                <div className="grid gap-2">
                  <Label>Carrier Name <span className="text-red-500">*</span></Label>
                  <Input 
                    placeholder="e.g. Maxicare Healthcare" 
                    value={formData.carrierName}
                    onChange={(e) => handleInputChange('carrierName', e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Default Plan Name <span className="text-red-500">*</span></Label>
                  <Input 
                    placeholder="e.g. Corporate Standard" 
                    value={formData.planName}
                    onChange={(e) => handleInputChange('planName', e.target.value)}
                  />
                </div>
              </TabsContent>
              <TabsContent value="address" className="space-y-4 py-4">
                <div className="grid gap-2">
                  <Label>Street Address <span className="text-red-500">*</span></Label>
                  <Input 
                    placeholder="Claim mailing address" 
                    value={formData.streetAddress}
                    onChange={(e) => handleInputChange('streetAddress', e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="grid gap-2">
                    <Label>City <span className="text-red-500">*</span></Label>
                    <Input 
                      value={formData.city}
                      onChange={(e) => handleInputChange('city', e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Province <span className="text-red-500">*</span></Label>
                    <Input 
                      value={formData.province}
                      onChange={(e) => handleInputChange('province', e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Zip Code <span className="text-red-500">*</span></Label>
                    <Input 
                      value={formData.zipCode}
                      onChange={(e) => handleInputChange('zipCode', e.target.value)}
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label>Payer ID / EDI Number <span className="text-red-500">*</span></Label>
                  <Input 
                    placeholder="For electronic claims" 
                    value={formData.payerId}
                    onChange={(e) => handleInputChange('payerId', e.target.value)}
                  />
                </div>
              </TabsContent>
              <TabsContent value="philhealth" className="space-y-4 py-4">
                <div className="bg-blue-50 p-4 rounded-lg text-sm text-blue-700 mb-4">
                  These fields are required for PhilHealth accreditation and claims processing.
                </div>
                <div className="grid gap-2">
                  <Label>Accreditation Number (PAN) <span className="text-red-500">*</span></Label>
                  <Input 
                    placeholder="HCI Accreditation Number" 
                    value={formData.accreditationNumber}
                    onChange={(e) => handleInputChange('accreditationNumber', e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Expiration Date <span className="text-red-500">*</span></Label>
                  <Input 
                    type="date" 
                    value={formData.expirationDate}
                    onChange={(e) => handleInputChange('expirationDate', e.target.value)}
                  />
                </div>
              </TabsContent>
            </Tabs>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={handleCancel}>Cancel</Button>
              {currentTab === "philhealth" ? (
                <Button 
                  className="bg-blue-500" 
                  onClick={handleSaveCarrier}
                  disabled={!isPhilHealthValid()}
                >
                  Save Carrier
                </Button>
              ) : (
                <Button 
                  className="bg-blue-500" 
                  onClick={handleNext}
                  disabled={currentTab === "basic" ? !isBasicInfoValid() : !isAddressValid()}
                >
                  Next
                </Button>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Conditional Content */}
      {viewMode === "manage" && selectedCarrier ? (
        <div className="space-y-6">
          <Button 
            variant="ghost" 
            onClick={() => setViewMode("list")}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Carriers
          </Button>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>{selectedCarrier.name} Plans</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">Manage insurance plans for this carrier</p>
                </div>
                <Dialog open={isAddPlanDialogOpen} onOpenChange={setIsAddPlanDialogOpen}>
                  <DialogTrigger asChild>
                    <Button className="bg-blue-500 hover:bg-blue-600">
                      <Plus className="w-4 h-4 mr-2" />
                      Add Plan
                    </Button>
                  </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add Insurance Plan</DialogTitle>
              </DialogHeader>
              <div className="space-y-6 py-4">
                 {/* Plan Details Section */}
                 <div className="space-y-4">
                  <h3 className="font-semibold text-sm">Plan Details</h3>
                  <div className="space-y-2">
                    <Label>Plan Name <span className="text-red-500">*</span></Label>
                    <Input 
                      placeholder="e.g. Standard Corporate Plan" 
                      value={newPlanData.planName}
                      onChange={(e) => setNewPlanData({...newPlanData, planName: e.target.value})}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Benefit Renewal Month <span className="text-red-500">*</span></Label>
                      <Select 
                        value={newPlanData.renewalMonth}
                        onValueChange={(val) => setNewPlanData({...newPlanData, renewalMonth: val})}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select month" />
                        </SelectTrigger>
                        <SelectContent>
                          {[
                            "January", "February", "March", "April", "May", "June",
                            "July", "August", "September", "October", "November", "December",
                          ].map((month) => (
                            <SelectItem key={month} value={month}>
                              {month}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Type <span className="text-red-500">*</span></Label>
                      <Select 
                        value={newPlanData.type}
                        onValueChange={(val) => setNewPlanData({...newPlanData, type: val})}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="medical">Medical</SelectItem>
                          <SelectItem value="dental">Dental</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                {/* Coverage Logic Section */}
                <div className="space-y-4 border-t pt-4">
                  <h3 className="font-semibold text-sm">Coverage Table & Limits</h3>
                  <p className="text-xs text-muted-foreground">
                    Define the billing hierarchy and patient responsibility
                  </p>

                  <div className="space-y-3 bg-slate-50 p-4 rounded-lg">
                    <div className="space-y-2">
                      <Label className="text-sm">Deductible (First Layer) <span className="text-red-500">*</span></Label>
                      <div className="relative">
                        <span className="absolute left-3 top-2.5 text-muted-foreground">₱</span>
                        <Input 
                          className="pl-7" 
                          placeholder="0.00" 
                          value={newPlanData.deductible}
                          onChange={(e) => setNewPlanData({...newPlanData, deductible: e.target.value})}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Amount patient must pay before insurance covers
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm">Maximum Limit / LOA (Second Layer) <span className="text-red-500">*</span></Label>
                      <div className="relative">
                        <span className="absolute left-3 top-2.5 text-muted-foreground">₱</span>
                        <Input 
                          className="pl-7" 
                          placeholder="0.00" 
                          value={newPlanData.maxLimit}
                          onChange={(e) => setNewPlanData({...newPlanData, maxLimit: e.target.value})}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">Maximum amount the insurance will pay</p>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm">Co-Pay / Co-Insurance <span className="text-red-500">*</span></Label>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="relative">
                          <Input 
                            type="number" 
                            placeholder="Amount" 
                            value={newPlanData.coPayAmount}
                            onChange={(e) => setNewPlanData({...newPlanData, coPayAmount: e.target.value})}
                          />
                        </div>
                        <Select 
                          value={newPlanData.coPayType}
                          onValueChange={(val) => setNewPlanData({...newPlanData, coPayType: val})}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Fixed or %" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="fixed">Fixed Amount</SelectItem>
                            <SelectItem value="percent">Percentage (%)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Patient's share of remaining balance after deductible and LOA
                      </p>
                    </div>
                  </div>
                </div>

                <Button className="w-full bg-blue-500" onClick={handleSavePlan}>Save Plan</Button>
              </div>
            </DialogContent>
          </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Plan Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
              <TableBody>
                {selectedCarrier.insurance_plans && selectedCarrier.insurance_plans.length > 0 ? (
                  selectedCarrier.insurance_plans.map((plan) => (
                  <TableRow key={plan.insurance_id ?? plan.plan_id}>
                    <TableCell className="font-medium">{plan.plan_name}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="bg-gray-100 text-gray-700">
                        {plan.type || "Medical"} 
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => handleOpenEditPlan(plan)}>Edit</Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => setDeletingPlan(plan)}
                        >
                          <Trash2 className="w-4 h-4 mr-1" />
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                      No plans found for this carrier.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Edit Insurance Plan Dialog */}
        <Dialog open={isEditPlanDialogOpen} onOpenChange={(open) => {
          setIsEditPlanDialogOpen(open)
          if (!open) setEditingPlan(null)
        }}>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Insurance Plan</DialogTitle>
            </DialogHeader>
            <div className="space-y-6 py-4">
              <div className="space-y-4">
                <h3 className="font-semibold text-sm">Plan Details</h3>
                <div className="space-y-2">
                  <Label>Plan Name <span className="text-red-500">*</span></Label>
                  <Input
                    placeholder="e.g. Standard Corporate Plan"
                    value={editPlanData.planName}
                    onChange={(e) => setEditPlanData({ ...editPlanData, planName: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Benefit Renewal Month <span className="text-red-500">*</span></Label>
                    <Select
                      value={editPlanData.renewalMonth}
                      onValueChange={(val) => setEditPlanData({ ...editPlanData, renewalMonth: val })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select month" />
                      </SelectTrigger>
                      <SelectContent>
                        {[
                          "January", "February", "March", "April", "May", "June",
                          "July", "August", "September", "October", "November", "December",
                        ].map((month) => (
                          <SelectItem key={month} value={month}>
                            {month}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Type <span className="text-red-500">*</span></Label>
                    <Select
                      value={editPlanData.type}
                      onValueChange={(val) => setEditPlanData({ ...editPlanData, type: val })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="medical">Medical</SelectItem>
                        <SelectItem value="dental">Dental</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div className="space-y-4 border-t pt-4">
                <h3 className="font-semibold text-sm">Coverage Table & Limits</h3>
                <p className="text-xs text-muted-foreground">
                  Define the billing hierarchy and patient responsibility
                </p>

                <div className="space-y-3 bg-slate-50 p-4 rounded-lg">
                  <div className="space-y-2">
                    <Label className="text-sm">Deductible (First Layer) <span className="text-red-500">*</span></Label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-muted-foreground">₱</span>
                      <Input
                        className="pl-7"
                        placeholder="0.00"
                        value={editPlanData.deductible}
                        onChange={(e) => setEditPlanData({ ...editPlanData, deductible: e.target.value })}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Amount patient must pay before insurance covers
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm">Maximum Limit / LOA (Second Layer) <span className="text-red-500">*</span></Label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-muted-foreground">₱</span>
                      <Input
                        className="pl-7"
                        placeholder="0.00"
                        value={editPlanData.maxLimit}
                        onChange={(e) => setEditPlanData({ ...editPlanData, maxLimit: e.target.value })}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">Maximum amount the insurance will pay</p>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm">Co-Pay / Co-Insurance <span className="text-red-500">*</span></Label>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="relative">
                        <Input
                          type="number"
                          placeholder="Amount"
                          value={editPlanData.coPayAmount}
                          onChange={(e) => setEditPlanData({ ...editPlanData, coPayAmount: e.target.value })}
                        />
                      </div>
                      <Select
                        value={editPlanData.coPayType}
                        onValueChange={(val) => setEditPlanData({ ...editPlanData, coPayType: val })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Fixed or %" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="fixed">Fixed Amount</SelectItem>
                          <SelectItem value="percent">Percentage (%)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Patient's share of remaining balance after deductible and LOA
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => { setIsEditPlanDialogOpen(false); setEditingPlan(null) }}>
                  Cancel
                </Button>
                <Button className="bg-blue-500" onClick={handleUpdatePlan}>
                  Save Changes
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-6 md:grid-cols-4">
        <Card className="bg-gradient-to-br from-blue-50 to-white border-blue-100">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="p-3 bg-blue-100 rounded-full text-blue-600">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Active Carriers</p>
              <h3 className="text-2xl font-bold">
                {loading ? '...' : activeCarriersCount}
              </h3>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Default Carriers Library</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-sm text-muted-foreground py-8 text-center">Loading carriers...</div>
          ) : carriers.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">No carriers found</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Active Plans</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {carriers.map((carrier) => (
                <TableRow key={carrier.id}>
                  <TableCell className="font-medium">{carrier.name}</TableCell>
                  <TableCell>{carrier.type}</TableCell>
                  <TableCell>{carrier.plans} Plans</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="bg-green-100 text-green-700">
                      {carrier.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenEditCarrier(carrier)}
                      >
                        Edit
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => {
                          setSelectedCarrier(carrier)
                          setViewMode("manage")
                        }}
                      >
                        Manage
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={() => setDeletingCarrier(carrier)}
                      >
                        <Trash2 className="w-4 h-4 mr-1" />
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          )}
        </CardContent>
      </Card>
        </div>
      )}

      {/* Delete Carrier Confirmation Dialog */}
      <Dialog open={deletingCarrier !== null} onOpenChange={(open) => { if (!open && !deletingBusy) setDeletingCarrier(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Carrier</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <span className="font-semibold text-gray-900">{deletingCarrier?.name}</span> and its associated insurance plans? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" disabled={deletingBusy} onClick={() => setDeletingCarrier(null)}>
              Cancel
            </Button>
            <Button className="bg-red-600 hover:bg-red-700 text-white" disabled={deletingBusy} onClick={handleConfirmDeleteCarrier}>
              {deletingBusy ? "Deleting..." : "Delete Carrier"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Insurance Plan Confirmation Dialog */}
      <Dialog open={deletingPlan !== null} onOpenChange={(open) => { if (!open && !deletingBusy) setDeletingPlan(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Insurance Plan</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <span className="font-semibold text-gray-900">{deletingPlan?.plan_name}</span>? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" disabled={deletingBusy} onClick={() => setDeletingPlan(null)}>
              Cancel
            </Button>
            <Button className="bg-red-600 hover:bg-red-700 text-white" disabled={deletingBusy} onClick={handleConfirmDeletePlan}>
              {deletingBusy ? "Deleting..." : "Delete Plan"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
