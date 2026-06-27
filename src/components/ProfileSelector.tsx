import type { Profile } from '../lib/profiles'

const ITEMS: { id: Profile; name: string; desc: string }[] = [
  { id: 'ecommerce', name: 'E-commerce', desc: 'Max compressione · Draco + ETC1S' },
  { id: 'ar',        name: 'AR / Meta',  desc: 'Alta qualità · Meshopt + UASTC' },
  { id: 'custom',    name: 'Custom',     desc: 'Configura manualmente' },
]

interface Props {
  profile: Profile
  onSelect: (p: Profile) => void
  disabled?: boolean
}

export function ProfileSelector({ profile, onSelect, disabled }: Props) {
  return (
    <div>
      <div className="ll-section-label">Profili</div>
      <div className="ll-profiles">
        {ITEMS.map(it => (
          <button
            key={it.id}
            type="button"
            className={`ll-profile ll-profile--${profile === it.id ? 'active' : 'inactive'}`}
            onClick={disabled ? undefined : () => onSelect(it.id)}
            disabled={disabled}
          >
            <span className="ll-profile-name">{it.name}</span>
            <span className="ll-profile-desc">{it.desc}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
