export default function Spinner({ text = 'Loading...' }) {
  return (
    <div className="loading">
      <div className="spinner" />
      <div className="loading-text">{text}</div>
    </div>
  )
}
