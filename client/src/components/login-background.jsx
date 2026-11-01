export function LoginBackground() {
  return (
      <div className="absolute top-0 left-0 right-0 w-full overflow-hidden leading-none pointer-events-none z-0">
        <svg
          viewBox="0 0 1440 380"
          className="w-full h-[260px] sm:h-[320px] md:h-[380px] object-cover"
          preserveAspectRatio="none"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="waveGradient" x1="0%" y1="0%" x2="100%" y2="80%">
              <stop offset="0%" stopColor="#55C9FD" />
              <stop offset="50%" stopColor="#6FD2FD" />
              <stop offset="100%" stopColor="#8BE0FE" />
            </linearGradient>
            <filter id="softGlow" x="-5%" y="-5%" width="110%" height="115%">
              <feDropShadow dx="0" dy="8" stdDeviation="14" floodColor="#38bdf8" floodOpacity="0.22" />
            </filter>
          </defs>
          
          {/* Main Soft Top Wave */}
          <path
            d="M0 0H1440V180C1320 250 1180 270 1020 220C860 170 700 160 520 220C360 275 180 265 0 180V0Z"
            fill="url(#waveGradient)"
            filter="url(#softGlow)"
          />
          {/* Ambient curve matching provided mockup */}
          <path
            d="M0 0H1440V160C1290 230 1140 255 980 200C820 145 660 155 490 215C320 275 160 255 0 165V0Z"
            fill="url(#waveGradient)"
            opacity="0.9"
          />
        </svg>
      </div>
  )
}
