import { useState, useEffect } from "react"
import { Cloud, CloudRain, Sun, CloudDrizzle, MapPin } from "lucide-react"
import { useBranch } from "@/lib/branch-context"

export function DateDisplay() {
  const { selectedBranch } = useBranch()
  const [currentDate, setCurrentDate] = useState(new Date())
  const [weather, setWeather] = useState({ temp: 29, condition: 'cloudy' })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Update date every minute
    const dateInterval = setInterval(() => {
      setCurrentDate(new Date())
    }, 60000)

    // Fetch Manila weather
    const fetchWeather = async () => {
      try {
        const response = await fetch(
          'https://api.open-meteo.com/v1/forecast?latitude=14.5995&longitude=120.9842&current=temperature_2m,weather_code&timezone=Asia/Manila'
        )
        const data = await response.json()
        
        if (data.current) {
          const temp = Math.round(data.current.temperature_2m)
          const weatherCode = data.current.weather_code
          
          // Map weather codes to conditions
          let condition = 'cloudy'
          if (weatherCode === 0) condition = 'sunny'
          else if (weatherCode >= 51 && weatherCode <= 67) condition = 'rainy'
          else if (weatherCode >= 80 && weatherCode <= 99) condition = 'rainy'
          else if (weatherCode >= 1 && weatherCode <= 3) condition = 'cloudy'
          
          setWeather({ temp, condition })
        }
      } catch (error) {
        console.error('Failed to fetch weather:', error)
        // Fallback to typical Manila weather
        setWeather({ temp: 29, condition: 'cloudy' })
      } finally {
        setLoading(false)
      }
    }

    fetchWeather()
    // Refresh weather every 30 minutes
    const weatherInterval = setInterval(fetchWeather, 1800000)

    return () => {
      clearInterval(dateInterval)
      clearInterval(weatherInterval)
    }
  }, [])

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  
  const dayName = dayNames[currentDate.getDay()]
  const monthName = monthNames[currentDate.getMonth()]
  const day = currentDate.getDate()
  const year = currentDate.getFullYear()

  const WeatherIcon = () => {
    switch (weather.condition) {
      case 'sunny':
        return <Sun className="w-8 h-8 text-primary/60" />
      case 'rainy':
        return <CloudRain className="w-8 h-8 text-primary/60" />
      case 'drizzle':
        return <CloudDrizzle className="w-8 h-8 text-primary/60" />
      default:
        return <Cloud className="w-8 h-8 text-primary/60" />
    }
  }

  return (
    <div className="flex items-center justify-between mb-6 -mt-8">
      <div className="flex items-center gap-6">
        <h1 
          className="text-5xl font-bold tracking-wide"
          style={{ 
            fontFamily: 'Geist, sans-serif',
            background: 'linear-gradient(180deg, #A8D5FF 0%, #7AB8E8 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text'
          }}
        >
          {dayName}
        </h1>
        <div className="w-1 h-16 bg-gradient-to-b from-[#A8D5FF] to-[#7AB8E8] opacity-30 rounded-full" />
        <div 
          className="flex flex-col justify-center"
          style={{ 
            fontFamily: 'Geist, sans-serif',
            background: 'linear-gradient(180deg, #A8D5FF 0%, #7AB8E8 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text'
          }}
        >
          <div className="text-xl leading-tight font-semibold">{monthName} {day}</div>
          <div className="text-xl leading-tight font-semibold text-right">{year}</div>
        </div>
      </div>

      <div className="flex items-center gap-8">
        <div className="flex items-center gap-2">
          <WeatherIcon />
          <span 
            className="text-4xl font-bold"
            style={{ 
              fontFamily: 'Geist, sans-serif',
              background: 'linear-gradient(180deg, #A8D5FF 0%, #7AB8E8 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text'
            }}
          >
            {loading ? '...' : `${weather.temp}°C`}
          </span>
        </div>

        <div 
          className="text-right"
          style={{ 
            fontFamily: 'Geist, sans-serif',
            background: 'linear-gradient(180deg, #A8D5FF 0%, #7AB8E8 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text'
          }}
        >
          <div className="text-lg font-bold -mb-1">{selectedBranch ? selectedBranch.name : 'Metropolitan'}</div>
          <div className="text-sm font-semibold opacity-90">{selectedBranch ? 'Branch Portal' : 'Medical Center'}</div>
        </div>
      </div>
    </div>
  )
}
