export default function UserAvatar({ user, size = 32 }) {
  if (user?.avatar) {
    return (
      <img
        src={user.avatar}
        alt={user.username}
        className="user-avatar-img"
        style={{ width: size, height: size, borderRadius: '50%' }}
      />
    )
  }
  const letter = (user?.username || '?')[0].toUpperCase()
  return (
    <div
      className="user-avatar-letter"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
    >
      {letter}
    </div>
  )
}
