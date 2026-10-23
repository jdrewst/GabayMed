import { useEffect, useState } from "react"
import { Header } from "@/components/header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Building2, Mail, Phone, MapPin, Globe, Clock } from "lucide-react"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { profileAPI } from "../../services/profile" // Import API

export default function ProfilePage() {
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

  return (
    <div className="min-h-screen bg-[#f9f9f9]">
      <Header />
      <main className="container mx-auto px-6 py-8 -mt-8">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="flex items-center gap-4 mb-6">
            <Avatar className="w-20 h-20">
              <AvatarImage src="/caring-doctor.png" alt="User" />
              <AvatarFallback>{locationInfo.abbreviation || 'DR'}</AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-2xl font-bold">
                {loading ? "Loading..." : locationInfo.clinicName}
              </h1>
              <p className="text-muted-foreground">View your profile and location information</p>
            </div>
          </div>

          {/* Location Information Card */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Location Information</CardTitle>
              <Button onClick={() => window.location.href = '/settings?tab=location'}>
                Edit Profile
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
                  <Label>Clinic Name</Label>
                  <Input value={locationInfo.clinicName || ''} readOnly className="bg-muted cursor-not-allowed" />
                </div>
                <div className="space-y-2">
                  <Label>Abbreviation</Label>
                  <Input value={locationInfo.abbreviation || ''} readOnly className="bg-muted cursor-not-allowed" />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Address</Label>
                  <Input value={locationInfo.address || ''} readOnly className="bg-muted cursor-not-allowed" />
                </div>
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input value={locationInfo.phone || ''} readOnly className="bg-muted cursor-not-allowed" />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input type="email" value={locationInfo.email || ''} readOnly className="bg-muted cursor-not-allowed" />
                </div>
                <div className="space-y-2">
                  <Label>Timezone</Label>
                  <Input value={locationInfo.timezone || ''} readOnly className="bg-muted cursor-not-allowed" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
