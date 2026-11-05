import { useState, type FormEvent } from 'react'
import { credits, signIn, signOut, useDemo } from '../lib/account'
import { Link, navigate, useTitle } from '../router'

export function Login() {
  useTitle('เข้าสู่ระบบทดลอง')
  const demo = useDemo()
  const [name, setName] = useState(demo.account?.name ?? '')
  const [email, setEmail] = useState(demo.account?.email ?? '')
  const [error, setError] = useState<string | null>(null)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return setError('ใส่ชื่อที่ใช้แสดงในบัญชี')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError('รูปแบบอีเมลไม่ถูกต้อง เช่น name@example.com')
    signIn(name.trim().slice(0, 60), email.trim().slice(0, 120))
    navigate('/account')
  }

  return (
    <div className="page page-narrow">
      <h1>เข้าสู่ระบบทดลอง</h1>
      <p>
        บัญชีทดลองเก็บไว้ในเบราว์เซอร์นี้เท่านั้น ไม่มีรหัสผ่าน ไม่ส่งข้อมูลไปที่ใด ใช้เพื่อดูประวัติการใช้เครดิต
      </p>
      <form className="form" onSubmit={submit} noValidate>
        <label className="field">
          <span className="field-label">ชื่อร้านหรือชื่อของคุณ</span>
          <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        </label>
        <label className="field">
          <span className="field-label">อีเมล</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" />
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button type="submit" className="btn btn-primary">เข้าใช้งานแบบทดลอง</button>
      </form>
    </div>
  )
}

export function Account() {
  useTitle('บัญชีของฉัน')
  const demo = useDemo()
  if (!demo.account) {
    return (
      <div className="page page-narrow">
        <h1>บัญชีของฉัน</h1>
        <p>ยังไม่ได้เข้าสู่ระบบ ตอนนี้ใช้เครดิตทดลองแบบไม่ระบุชื่อ เหลือ {credits(demo)} เครดิต</p>
        <Link href="/login" className="btn btn-primary">เข้าสู่ระบบทดลอง</Link>
      </div>
    )
  }
  const { account } = demo
  return (
    <div className="page page-narrow">
      <h1>{account.name}</h1>
      <p>{account.email} · บัญชีทดลองในเบราว์เซอร์นี้</p>
      <p className="balance">
        <span className="tabular">{account.credits}</span> เครดิตทดลอง <Link href="/pricing">เติมเครดิต</Link>
      </p>
      <table className="spec spec-wide">
        <caption>ประวัติล่าสุด</caption>
        <tbody>
          {account.history.map((h, i) => (
            <tr key={`${h.at}-${i}`}>
              <td className="tabular">{new Date(h.at).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })}</td>
              <td>{h.text}</td>
              <td className="num tabular">{h.delta > 0 ? `+${h.delta}` : h.delta || ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" className="btn btn-ghost" onClick={() => { signOut(); navigate('/') }}>
        ออกจากระบบและล้างข้อมูลบัญชี
      </button>
    </div>
  )
}
