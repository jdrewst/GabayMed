import { useEffect, useState } from "react"
import { Header } from "@/components/header"
import { CarrierManagement } from "@/components/carrier-management"
import { GabayAPI } from "../../services/gabayApi"

export default function CarriersPage() {
  const [carriers, setCarriers] = useState([])
  const [loading, setLoading] = useState(true)

  const loadCarriers = async () => {
    try {
      setLoading(true)
      const data = await GabayAPI.getCarriers()
      setCarriers(data)
      return data
    } catch (error) {
      console.error("Failed to load carriers:", error)
      return []
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCarriers()
  }, [])

  return (
    <div className="min-h-screen bg-[#f9f9f9]">
      <Header />
      <main className="container mx-auto px-6 py-6">
        {/* Pass the fetched data and refresh callback to the component */}
        <CarrierManagement carriers={carriers} loading={loading} onRefresh={loadCarriers} />
      </main>
    </div>
  )
}
