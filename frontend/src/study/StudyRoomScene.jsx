export default function StudyRoomScene() {
  return <svg className="study-room-drawing" viewBox="0 0 1200 560" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs>
      <pattern id="study-paper-grain" width="13" height="13" patternUnits="userSpaceOnUse"><circle cx="2" cy="3" r=".6" fill="#766c50" opacity=".09" /></pattern>
      <clipPath id="study-window-clip"><path d="M72 127 270 93 271 347 72 382Z" /></clipPath>
    </defs>
    <path fill="#f6f3e9" d="M0 0h1200v560H0z" />
    <path fill="url(#study-paper-grain)" d="M0 0h1200v560H0z" />
    <g stroke="#4e5146" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M309 -10q-5 208 0 408L92 559M309 398q474 5 904-2" opacity=".35" />
      <path d="M0 476 309 398" opacity=".25" />
      {/* A wonky wooden window, with rain clipped to the glass. */}
      <path d="m60 116 221-39 2 281-223 40Z" fill="#dedac8" />
      <path d="m72 127 198-34 1 254-199 35Z" fill="#dce3da" />
      <g clipPath="url(#study-window-clip)">
        <path d="M59 304q46-41 79-20t60-12 85 0v130H50Z" fill="#bccabc" stroke="none" />
        <path d="m57 340 49-13v-52l28-4v50l39-8v-87l46-8v84l78-22v130H50Z" fill="#9eafa0" stroke="none" opacity=".6" />
        <path d="M78 180q14-25 29-9 16-36 42-12 22-7 24 12" stroke="#a1b0a5" opacity=".7" />
        <g stroke="#7b9286" strokeWidth="1.7" opacity=".6">
          {Array.from({ length: 22 }, (_, i) => <path className="room-animated room-rain" key={i} style={{ animationDelay: `${-(i % 7) * .47}s`, animationDuration: `${2.3 + i % 4 * .35}s` }} d={`m${83 + i * 37 % 178} ${90 + i * 53 % 270} -5 18`} />)}
        </g>
      </g>
      <path d="m170 110 1 254M74 247l196-34M60 398l221-39 12 9-225 42Z" fill="#e8e3d3" />
      <path d="m87 154 10-16M87 164l23-30" stroke="#f8faf3" strokeWidth="3" />
      {/* A shelf, books, and a little wall print. */}
      <path d="m960 119 155 2 5 9-162-1ZM979 130v13m120-13v13" fill="#d8c8ac" />
      <path d="m977 119-2-56 17-1 1 57m5 0 2-71h16l-1 71m9 0-7-52 16-3 9 55" fill="#c2cdb8" />
      <path d="m1004 58 9 0m-33 15h10m38 2 7 34" opacity=".6" />
      <path d="M1061 106q-1-19 16-19t17 19l-2 13h-29Z" fill="#ece4ce" />
      <path d="M1075 87q-11-12 1-26 14 9 3 26m-3-10q-16-3-17-15 15-3 17 15" fill="#a9bda1" />
      <path d="m1000 195 87-3 3 104-87 2Z" fill="#fffdf4" />
      <path d="m1009 203 69-2 2 85-69 2Z" strokeWidth="1" />
      <circle cx="1042" cy="232" r="13" fill="#e5cd91" stroke="none" />
      <path d="m1025 268 18-24 24 23m-44 8h48" stroke="#82947b" />
      <path d="m1031 188 22 0 1 12-22 1Z" fill="#d9dec6" stroke="none" opacity=".9" />
      {/* Desk surface and open notebook. */}
      <path d="m416 475 517-1 59 66-628-1Z" fill="#e6dfcb" />
      <path d="m365 539 626 1-2 12-625-1ZM407 551l-4 22m547-22 5 22" fill="#cbbd9e" />
      <path d="m536 495 63-6 37 10 40-9 65 5-9 31-97-5-105 6Z" fill="#fffdf5" />
      <path d="m636 499-1 22m-82-21 51-3m-51 11 50-4m58-4 55 2m-56 7 50 2" strokeWidth="1.4" opacity=".7" />
      <path d="m757 516 33-13 3 5-32 13-8 0Z" fill="#809372" />
      {/* A soft little study companion peeking over the desk. */}
      <g className="room-animated room-companion">
        <path d="M542 476q-6-56 18-83 9-24 31-13 21-17 43 0 29-7 40 18 15 30 9 78" fill="#faf8ee" strokeWidth="3" />
        <path className="room-animated room-eyes" d="M568 414q-1-6 2-6t2 6m58 0q-1-6 2-6t2 6" strokeWidth="4" />
        <path d="m591 427 8 5 8-5m-8 5v7m-17 2q17 12 34-1" strokeWidth="2" />
        <ellipse cx="556" cy="474" rx="18" ry="10" fill="#faf8ee" transform="rotate(-9 556 474)" />
        <ellipse cx="671" cy="474" rx="18" ry="10" fill="#faf8ee" transform="rotate(8 671 474)" />
        <path d="m565 430 9 1m55-1 10-1" stroke="#d4ac97" strokeWidth="4" />
      </g>
      {/* Tea and the slowest possible steam. */}
      <path d="m836 457 41 1-3 37q-16 10-34-1Z" fill="#c1cfb2" />
      <path d="M877 464q24-4 19 14-3 10-20 7m-42 14q20 10 50-1" />
      <g className="room-animated room-steam" stroke="#929a83" strokeWidth="1.8"><path d="M846 445q-9-10 0-20m15 20q9-10 0-22m12 20q6-7 1-13" /></g>
      {/* Floor plant and a sleeping cat. */}
      <path d="m151 475 55 2-8 58q-18 10-40-2Z" fill="#d4b29c" />
      <path d="m147 470 65 1-3 13-61-1Z" fill="#e4c4aa" />
      <path className="room-animated room-leaves" d="M179 470q-3-43 11-72m-11 62q-34-11-32-47 31-2 32 47m5-24q-2-39 31-43 8 29-31 43m-4 27q22-30 48-16-6 22-48 16" fill="#b3c4a8" />
      <path d="M1023 471q-20-18-12-46l19 12q35-19 57 6 36-5 53 19 13 18-7 27h-105q-21-1-5-18Z" fill="#d5cbbb" />
      <path d="m1013 428 10 17m9 8 7 3m15-4 8-3m-20 13 4 3 4-3m60 18q-30 14-29-4 1-11 19-9" />
      <g className="room-animated room-snooze" strokeWidth="1.7"><path d="m1102 420 9-1-8 10 10-1m12-29 12-1-10 13 12-1" /></g>
    </g>
  </svg>;
}
