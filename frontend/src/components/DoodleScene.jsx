// Original SVG illustrations; all moving parts share the app's motion preference.
export default function DoodleScene({ scene = "dashboard" }) {
  return <svg className="doodle-scene" viewBox="0 0 500 240" fill="none" aria-hidden="true">
    <ellipse cx="255" cy="206" rx="205" ry="16" fill="#e9e8d8" />
    <g stroke="#515749" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M32 208q204-4 435 1" opacity=".4" />
      <g className="doodle-animated doodle-sparkle" stroke="#a4ad87"><path d="M407 45v20m-10-10h20m-34-25v10m-5-5h10" /><circle cx="72" cy="69" r="4" /></g>
      {scene === "dashboard" && <>
        <path d="m70 150 94 2-4 49-85 1Z" fill="#dcc1a7" />
        <g className="doodle-animated doodle-sway"><path d="M116 151V85m0 42q-47-5-45-45 43 2 45 45m0-20q47-11 45-47-46 4-45 47m0-22q-27-21-8-53 33 20 8 53" fill="#b6c6a6" /><path d="m86 101 29 24m22-43-21 24" opacity=".5" /></g>
        <path d="m337 95 100-8 10 106-99 9Z" fill="#fffdf4" /><path d="m361 85 32-3 2 14-32 3" fill="#dce3c9" stroke="none" />
        <path d="m363 175 17-25 16 7 24-38m-8 3 9-5 1 11" stroke="#7b9162" strokeWidth="3" /><path d="m361 184 68-6m-74-64 47-4" opacity=".5" />
      </>}
      {scene === "upload" && <>
        <path d="m58 146 113 3 11 47-119 3Z" fill="#cfdbc0" /><path d="m66 139 33 1 8 10 67-1 4 49H65Z" fill="#dce5d1" />
        <g className="doodle-animated doodle-float"><path d="m84 68 65-5 18 20 1 76-77 4Z" fill="#fffdf4" /><path d="m149 64 1 23 17-4m-63 18 44-3m-43 16 43-2m-43 17 30-2" /></g>
        <g className="doodle-animated doodle-plane"><path d="m346 83 102-37-44 82-15-31Z" fill="#e7cf9f" /><path d="m389 97 59-51m-60 51-3 28 19-19" /></g>
        <path d="M351 125q-17 50 43 53 36-3 18-18-25-8-29 43" strokeDasharray="5 7" opacity=".5" />
      </>}
      {scene === "review" && <>
        <path d="m53 99 101-19 15 118-104 13Z" fill="#e3d4af" /><path d="m66 86 102-5 5 111-104 6Z" fill="#fffdf4" />
        <g className="doodle-animated doodle-float"><path d="m75 77 102 10-8 105-102-10Z" fill="#eef1df" /><path d="m102 116 9 10 19-24m-35 45 54 4m-53 12 39 3" stroke="#788e62" /></g>
        <path d="M388 192v-67m0 40q-39-4-37-32 35-2 37 32m0-21q33-24 54 0-17 23-54 0" fill="#bdcba9" />
        <g className="doodle-animated doodle-sparkle" transform="translate(388 101)"><path d="M0-14q-16-24-23-8-15 0-7 16-10 14 8 16 5 20 22 4 17 16 22-4 18-2 8-16 8-16-7-16-7-16-23 8Z" fill="#e6d095" /><circle r="8" fill="#b7c9a4" /></g>
      </>}
      {scene === "activities" && <>
        <g className="doodle-animated doodle-float"><path d="M86 58q-31 55 29 61-55 33-67-19-4-29 38-42Z" fill="#e6d29f" /></g>
        <path d="m358 154 49 2-4 43q-18 10-40-1Z" fill="#bacba8" /><path d="M408 163q32-4 21 18-6 11-23 7m-50 16q24 9 58-1" />
        <g className="doodle-animated doodle-steam"><path d="M369 140q-12-15 0-30m18 31q12-13 0-30m14 29q8-11 0-18" stroke="#8e9b7a" /></g>
        <path d="m56 190 72-8 24 15-74 8Zm29-18 72-8 22 13-70 7Z" fill="#d8c9ad" />
      </>}
      <g className="doodle-animated doodle-buddy">
        <path d="M199 204q-8-68 18-88 14-21 32-8 24-17 40 4 30 15 20 92Z" fill="#fffdf4" strokeWidth="2.8" />
        <path className="doodle-animated doodle-blink" d="M230 153v5m47-5v5" strokeWidth="4" />
        <path d="m245 170 8 4 7-5m-15 12q9 5 16-1" /><path d="m218 171 9 1m54-1 8-1" stroke="#d7af98" strokeWidth="4" />
        {scene === "activities" ? <path d="m219 196 22-6q12 1 12 12m37-6-19-6q-11 0-13 12" /> : <><path d="m216 190 36-6 34 8-3 23-31-8-36 4Z" fill="#dae3c9" /><path d="m252 184 0 23m-27-11 18-3m17 3 15 3" /></>}
      </g>
      <path d="m182 51 6 9 10-2-7 8 4 10-10-4-8 7 1-12-9-6 11-1Z" fill="#e7d8b0" strokeWidth="1.5" />
    </g>
  </svg>;
}
