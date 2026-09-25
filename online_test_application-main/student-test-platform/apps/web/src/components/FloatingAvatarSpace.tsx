import type { LobbyStudent } from '../types/app';
import { AnimalAvatar } from './AnimalAvatar';

type Props = {
  students: LobbyStudent[];
  emptyLabel?: string;
};

// Deterministic pseudo-random layout + creature per student id, so avatars
// don't jump around or change species on every poll — only new arrivals get
// a new fixed spot and creature.
function hash(input: string) {
  let value = 0;
  for (let index = 0; index < input.length; index += 1) {
    value = (value * 31 + input.charCodeAt(index)) >>> 0;
  }
  return value;
}

export function FloatingAvatarSpace({ students, emptyLabel }: Props) {
  if (!students.length) {
    return <div className="avatar-field__empty">{emptyLabel || 'Waiting for students to join…'}</div>;
  }

  return (
    <div className="avatar-field">
      {students.map((student) => {
        const x = 6 + (hash(`${student.id}x`) % 84);
        const y = 12 + (hash(`${student.id}y`) % 68);
        const delay = (hash(`${student.id}d`) % 30) / 10;
        const duration = 6 + (hash(`${student.id}s`) % 30) / 10;
        const style = {
          left: `${x}%`,
          top: `${y}%`,
          animationDelay: `${delay}s`,
          animationDuration: `${duration}s`,
        };
        return (
          <div className="avatar-field__item" key={student.id} style={style}>
            <div className="avatar-orb">
              <AnimalAvatar avatar={{ id: student.id, name: student.name, imageUrl: student.avatarUrl || '', accentColor: '#5ebdff' }} size="md" />
            </div>
            <span className="avatar-field__name">{student.name}</span>
          </div>
        );
      })}
    </div>
  );
}
