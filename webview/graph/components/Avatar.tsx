import { authorColor, authorInitials } from '../avatar';
import './Avatar.css';

interface AvatarProps {
  readonly name: string;
  readonly size?: number;
}

/** Кружок с инициалами автора. Цвет стабилен для имени — см. `avatar.ts`. */
export function Avatar({ name, size = 20 }: AvatarProps) {
  return (
    <span
      className="gs-avatar"
      style={{ width: `${size}px`, height: `${size}px`, background: authorColor(name), fontSize: `${size * 0.42}px` }}
      title={name}
      aria-hidden="true"
    >
      {authorInitials(name)}
    </span>
  );
}
