import { useEffect, useState } from "react"
import { Header } from "@/components/header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Building2, Mail, Phone, MapPin, Globe, Clock } from "lucide-react"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { profileAPI } from "../../services/profile"
import { useBranch } from "@/lib/branch-context"
import { BranchSelector } from "@/components/branch-selector"
import { Badge } from "@/components/ui/badge"

export default function ProfilePage() {
  const { selectedBranch, isBranchPortal } = useBranch()
  const [locationInfo, setLocationInfo] = useState({
    clinicName: '',
    abbreviation: '',
    address: '',
    phone: '',
    email: '',
    timezone: ''
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchLocationInfo = async () => {
      setLoading(true);
      const data = await profileAPI.getFacilityProfile();
      
      if (data) {
        setLocationInfo(data);
      } else {
        // Fallback for demo if no DB connection or data
        setLocationInfo({
            clinicName: 'Metropolitan Medical Center',
            abbreviation: 'MMC-01',
            address: '123 Medical Plaza, Makati City',
            phone: '+63 2 8123 4567',
            email: 'info@metromedical.ph',
            timezone: 'Asia/Manila'
        });
      }
      setLoading(false);
    }

    fetchLocationInfo()

    const handleUpdate = (e) => {
      if (e.detail) {
        setLocationInfo(prev => ({ ...prev, ...e.detail }));
      } else {
        fetchLocationInfo();
      }
    };
    window.addEventListener('facilityUpdated', handleUpdate);
    return () => window.removeEventListener('facilityUpdated', handleUpdate);
  }, [])

  const displayedInfo = selectedBranch ? {
    clinicName: selectedBranch.name,
    abbreviation: selectedBranch.abbreviation,
    address: selectedBranch.address || locationInfo.address,
    phone: selectedBranch.contact_num || locationInfo.phone,
    email: selectedBranch.email || locationInfo.email,
    timezone: selectedBranch.timezone || 'Asia/Manila'
  } : locationInfo;

  return (
    <div className="min-h-screen bg-[#f9f9f9]">
      <Header />
      <main className="container mx-auto px-6 py-8 -mt-8">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-4 mb-6">
            <div className="flex items-center gap-4">
              <Avatar className="w-20 h-20">
                <AvatarImage src="/caring-doctor.png" alt="User" />
                <AvatarFallback>{displayedInfo.abbreviation || 'DR'}</AvatarFallback>
              </Avatar>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold">
                    {loading ? "Loading..." : displayedInfo.clinicName}
                  </h1>
                  {isBranchPortal && (
                    <Badge className="bg-blue-600 text-white text-xs">
                      Branch Portal
                    </Badge>
                  )}
                </div>
                <p className="text-muted-foreground">
                  {isBranchPortal
                    ? `Viewing details for ${selectedBranch.name} location`
                    : "View your profile and location information"}
                </p>
              </div>
            </div>
            <BranchSelector />
          </div>

          {/* Location Information Card */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Location Information</CardTitle>
                {isBranchPortal && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Reflecting selected branch portal: {selectedBranch.name}
                  </p>
                )}
              </div>
              <Button onClick={() => window.location.href = '/settings?tab=location'}>
                Edit Locations
              </Button>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center gap-6">
                <div className="w-24 h-24 border-2 border-dashed rounded-lg flex items-center justify-center bg-slate-50">
                  <Building2 className="w-8 h-8 text-slate-300" />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Clinic / Branch Name</Label>
                  <Input value={displayedInfo.clinicName || ''} readOnly className="bg-muted cursor-not-allowed" />
                </div>
                <div className="space-y-2">
                  <Label>Abbreviation</Label>
                  <Input value={displayedInfo.abbreviation || ''} readOnly className="bg-muted cursor-not-allowed" />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Address</Label>
                  <Input value={displayedInfo.address || ''} readOnly className="bg-muted cursor-not-allowed" />
                </div>
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input value={displayedInfo.phone || ''} readOnly className="bg-muted cursor-not-allowed" />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input type="email" value={displayedInfo.email || ''} readOnly className="bg-muted cursor-not-allowed" />
                </div>
                <div className="space-y-2">
                  <Label>Timezone</Label>
                  <Input value={displayedInfo.timezone || ''} readOnly className="bg-muted cursor-not-allowed" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
