import { Asterisk } from './asterisk'
import { Starburst } from './starburst'
import { Blob } from './blob'

export function HeroDecoration() {
  return (
    <div className="relative w-[160px] h-[100px]">
      <Blob className="absolute right-0 top-0" color="#FF9075" size={90} />
      <Asterisk className="absolute left-0 top-2" color="#FFE786" size={44} />
      <Starburst className="absolute left-16 top-10" color="#57B1FF" size={28} points={12} />
      <div className="absolute left-20 top-2 w-2 h-2 rounded-full bg-blue-500" aria-hidden="true" />
    </div>
  )
}
