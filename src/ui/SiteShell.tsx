import { useEffect, useState, type ReactNode } from 'react'
import { credits, useDemo } from '../lib/account'
import { Link, useLocation } from '../router'
import { Brand } from './Brand'
import { Icon } from './Icon'

const NAV = [
  { href: '/styles', label: 'แคตตาล็อกแบบป้าย' },
  { href: '/lightbox', label: 'กล่องไฟจากรูป' },
  { href: '/keychain', label: 'พวงกุญแจชื่อ' },
  { href: '/clicker', label: 'พวงกุญแจปุ่ม' },
  { href: '/twotone', label: 'พวงกุญแจสองสี' },
  { href: '/files', label: 'ไฟล์ 3D สำเร็จรูป' },
  { href: '/gen', label: 'โมเดลจาก AI' },
  { href: '/how-to', label: 'วิธีใช้' },
]

export function SiteShell({ children }: { children: ReactNode }) {
  const { path } = useLocation()
  const demo = useDemo()
  const [open, setOpen] = useState(false)

  useEffect(() => setOpen(false), [path])

  return (
    <div className="site">
      <Link className="skip" href="#content">ข้ามไปที่เนื้อหา</Link>
      <header className="masthead">
        <div className="masthead-inner">
          <Link href="/" className="masthead-brand" aria-label="JJDesign หน้าแรก">
            <Brand />
          </Link>
          <nav className="masthead-nav" data-open={open || undefined} aria-label="เมนูหลัก">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} aria-current={path.startsWith(item.href) ? 'page' : undefined}>
                {item.label}
              </Link>
            ))}
            <Link href="/plugin" className="masthead-minor" aria-current={path === '/plugin' ? 'page' : undefined}>ปลั๊กอิน</Link>
          </nav>
          <div className="masthead-end">
            <Link href={demo.account ? '/account' : '/login'} className="masthead-account">
              {demo.account ? (
                <>
                  <span className="tabular">{credits(demo)}</span> เครดิต
                </>
              ) : (
                'เข้าสู่ระบบ'
              )}
            </Link>
            <Link href="/app" className="btn btn-signal">เปิดตัวออกแบบ</Link>
            <button type="button" className="icon-link masthead-menu" aria-expanded={open} aria-label="เมนู" onClick={() => setOpen(!open)}>
              <Icon name={open ? 'close' : 'menu'} />
            </button>
          </div>
        </div>
      </header>
      <main id="content" tabIndex={-1}>{children}</main>
      <footer className="colophon">
        <div className="colophon-inner">
          <div className="colophon-brand">
            <Brand />
            <p>โปรแกรมออกแบบป้ายตัวอักษร 3 มิติบนเว็บ พิมพ์ข้อความไทยหรืออังกฤษ แล้วได้ไฟล์ผลิตหน่วยมิลลิเมตร</p>
          </div>
          <nav aria-label="ลิงก์ท้ายเว็บ" className="colophon-links">
            <div>
              <h2>ใช้งาน</h2>
              <Link href="/app">ตัวออกแบบ</Link>
              <Link href="/styles">แคตตาล็อกแบบป้าย</Link>
              <Link href="/lightbox">กล่องไฟจากรูป</Link>
              <Link href="/keychain">พวงกุญแจชื่อบับเบิล</Link>
              <Link href="/clicker">พวงกุญแจปุ่มคีย์บอร์ด</Link>
              <Link href="/twotone">พวงกุญแจชื่อสองสี</Link>
              <Link href="/gen">โมเดลจาก AI</Link>
              <Link href="/files">ไฟล์ 3D สำเร็จรูป</Link>
              <Link href="/plugin">ปลั๊กอิน</Link>
            </div>
            <div>
              <h2>ช่วยเหลือ</h2>
              <Link href="/how-to">วิธีใช้</Link>
              <Link href="/contact">ติดต่อเรา</Link>
              <Link href="/terms">เงื่อนไขการใช้งาน</Link>
              <Link href="/privacy">นโยบายความเป็นส่วนตัว</Link>
            </div>
          </nav>
        </div>
        <p className="colophon-note">
          เว็บนี้เป็นเวอร์ชันทดลอง บัญชีและเครดิตทำงานในเบราว์เซอร์ของคุณเท่านั้น ไม่มีการเก็บเงินจริง
        </p>
      </footer>
    </div>
  )
}
