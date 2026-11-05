import { PACKS } from '../data/shop'
import { credits, EXPORT_COST, STARTING_CREDITS, topUp, useDemo } from '../lib/account'
import { GROUPS, STYLES } from '../lib/styles'
import { Link, useTitle } from '../router'
import { Icon } from '../ui/Icon'

const baht = (n: number) => n.toLocaleString('th-TH')

export function Pricing() {
  useTitle('ราคาและเครดิต')
  const demo = useDemo()
  return (
    <div className="page">
      <header className="page-head">
        <h1>ออกแบบฟรี จ่ายเครดิตตอนดาวน์โหลด</h1>
        <p>
          หมุนดู ปรับขนาด และลองทุกแบบได้ไม่จำกัด เครดิตใช้เฉพาะตอนดาวน์โหลดไฟล์ผลิต ตอนนี้มีเครดิตทดลอง{' '}
          <strong className="tabular">{credits(demo)}</strong> เครดิต
        </p>
      </header>
      <table className="spec spec-wide">
        <caption>ค่าเครดิตต่อการดาวน์โหลด</caption>
        <tbody>
          <tr><td>ครบชุด ZIP (STL ทุกชิ้น + DXF + รายการชิ้นส่วน)</td><td className="num tabular">{EXPORT_COST.zip} เครดิต</td></tr>
          <tr><td>STL รวมทุกชิ้น</td><td className="num tabular">{EXPORT_COST.stl} เครดิต</td></tr>
          <tr><td>DXF เส้นตัด</td><td className="num tabular">{EXPORT_COST.dxf} เครดิต</td></tr>
          <tr><td>ไฟล์ 3D สำเร็จรูป</td><td className="num tabular">{EXPORT_COST.file} เครดิต</td></tr>
          <tr><td>บันทึกไฟล์งาน .jjd</td><td className="num">ฟรี</td></tr>
        </tbody>
      </table>
      <h2 className="section-title">แพ็กเครดิต (ราคาตัวอย่าง)</h2>
      <table className="spec spec-wide packs">
        <thead>
          <tr><th>แพ็ก</th><th className="num">เครดิต</th><th className="num">ราคา</th><th className="num">ต่อเครดิต</th><th><span className="sr-only">เติม</span></th></tr>
        </thead>
        <tbody>
          {PACKS.map((pack) => (
            <tr key={pack.id}>
              <td>{pack.note}</td>
              <td className="num tabular">{baht(pack.credits)}</td>
              <td className="num tabular">{baht(pack.price)} บาท</td>
              <td className="num tabular">{(pack.price / pack.credits).toFixed(2)} บาท</td>
              <td className="num">
                <button type="button" className="btn btn-ghost" onClick={() => topUp(pack.credits, `เติมเครดิตทดลอง ${pack.credits}`)}>
                  เติมทดลอง
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="note">
        ปุ่มเติมทดลองเพิ่มเครดิตในเบราว์เซอร์นี้ทันทีโดยไม่เก็บเงิน ราคาแพ็กเป็นตัวอย่างที่ร้านต้องกำหนดเองก่อนเปิดขายจริง
        ผู้ใช้ใหม่เริ่มที่ {STARTING_CREDITS} เครดิตทดลอง
      </p>
    </div>
  )
}

const GUIDES = [
  {
    id: 'start',
    title: 'เริ่มงานแรกใน 4 ขั้น',
    body: [
      'เปิดตัวออกแบบ พิมพ์ข้อความในขั้นที่ 1 เลือกฟอนต์ และตั้งความสูงตัวอักษรเป็นมิลลิเมตร ความสูงที่ตั้งคือความสูงของตัวอักษรเต็มบรรทัด',
      'ขั้นที่ 2 เลือกแบบป้ายจากแคตตาล็อก ใช้ช่องค้นหาหรือกดหมวด A ถึง G',
      'ขั้นที่ 3 ปรับความลึก ความหนาผนัง และระยะเผื่อสวม ตัวเลขทุกช่องพิมพ์ค่าเองได้',
      'ขั้นที่ 4 ตรวจรายการชิ้นส่วนและน้ำหนัก แล้วดาวน์โหลด ZIP ซึ่งมี STL ทุกชิ้นและ DXF ของชิ้นที่ตัดแผ่นได้',
    ],
  },
  {
    id: 'thai',
    title: 'ตัวอักษรไทย สระ และวรรณยุกต์',
    body: [
      'ระบบวางสระและวรรณยุกต์ตามข้อมูลในฟอนต์ จึงไม่ลอยหรือทับกัน ถ้าสระแตะพยัญชนะ ระบบจะรวมเป็นชิ้นเดียวให้อัตโนมัติ',
      'สระและวรรณยุกต์ที่แยกจากตัวอักษรจะเป็นชิ้นเล็ก ควรตั้งความหนาผนังไม่เกินหนึ่งในสี่ของความกว้างเส้นตัวอักษร',
      'ใช้ฟอนต์ของร้านเองได้ด้วยปุ่มใช้ฟอนต์ของตัวเอง ไฟล์ฟอนต์อยู่ในเบราว์เซอร์ของคุณเท่านั้น ไม่ถูกอัปโหลด',
    ],
  },
  {
    id: 'svg',
    title: 'นำเข้าโลโก้ SVG และรูปภาพ',
    body: [
      'SVG ต้องเป็นรูปทรงปิดที่เติมสี เส้นขอบอย่างเดียวจะไม่ถูกนำมาสร้างชิ้นงาน ใน Illustrator ใช้คำสั่ง Outline Stroke ก่อนส่งออก',
      'รูปภาพ PNG หรือ JPG ใช้กับโลโก้สีเดียวบนพื้นขาว ปรับค่าความเข้มจนขอบโลโก้คม ถ้าโลโก้สีอ่อนบนพื้นเข้มให้ติ๊กกลับสี',
    ],
  },
  {
    id: 'fit',
    title: 'ระยะเผื่อสวมและการพิมพ์',
    body: [
      'ระยะเผื่อสวม 0.2 มม. เหมาะกับเครื่องพิมพ์ทั่วไป ถ้าฝาแน่นเกินให้เพิ่มทีละ 0.05 มม.',
      'พิมพ์ผนังโดยวางด้านหลังแนบฐานพิมพ์ ไฟล์ทุกไฟล์วางแกน Z ชี้ออกด้านหน้าป้ายอยู่แล้ว',
      'ชิ้นที่ขึ้นป้ายตรวจใน slicer ในหน้าส่งออก เป็นชิ้นที่ประกอบจากหลายส่วน ให้เปิดใน slicer แล้วใช้คำสั่งซ่อมรูปทรงก่อนพิมพ์',
    ],
  },
  {
    id: 'site',
    title: 'ดูป้ายบนรูปหน้าร้านจริง',
    body: [
      'ในตัวออกแบบ กดปุ่มรูปหน้างานแล้วเลือกรูปถ่ายหน้าร้าน รูปจะเป็นฉากหลังของโมเดล หมุนและซูมให้ป้ายอยู่ตำแหน่งที่ต้องการ',
      'กดปุ่มกลางวันเพื่อสลับเป็นกลางคืน จะเห็นไฟจากชิ้นโปร่งแสงและแถบ LED',
    ],
  },
]

export function HowTo() {
  useTitle('วิธีใช้')
  return (
    <div className="page page-read">
      <header className="page-head">
        <h1>วิธีใช้ JJDesign</h1>
        <p>คู่มือสั้นสำหรับร้านป้ายและสายพิมพ์ 3D อ่านจบในไม่กี่นาที</p>
      </header>
      <div className="read-layout">
        <nav className="toc" aria-label="สารบัญ">
          <ol>
            {GUIDES.map((g) => (
              <li key={g.id}><a href={`#${g.id}`}>{g.title}</a></li>
            ))}
            <li><a href="#styles">แบบป้ายทั้งหมด</a></li>
          </ol>
        </nav>
        <article className="prose">
          {GUIDES.map((g) => (
            <section key={g.id} id={g.id}>
              <h2>{g.title}</h2>
              {g.body.map((para) => <p key={para}>{para}</p>)}
            </section>
          ))}
          <section id="styles">
            <h2>แบบป้ายทั้งหมด</h2>
            {GROUPS.map((g) => (
              <p key={g.id}>
                <strong>หมวด {g.letter} {g.name}</strong> {g.note}:{' '}
                {STYLES.filter((s) => s.group === g.id).map((s, i, arr) => (
                  <span key={s.id}>
                    <Link href={`/styles/${s.id}`}>{s.code} {s.name}</Link>
                    {i < arr.length - 1 ? ', ' : ''}
                  </span>
                ))}
              </p>
            ))}
          </section>
        </article>
      </div>
    </div>
  )
}

export function Plugin() {
  useTitle('ปลั๊กอิน')
  return (
    <div className="page page-read">
      <header className="page-head">
        <h1>ปลั๊กอิน Illustrator และ CorelDRAW</h1>
        <p>ปลั๊กอินสำหรับส่งงานจากโปรแกรมออกแบบเข้า JJDesign ในคลิกเดียว อยู่ระหว่างพัฒนา ยังไม่เปิดให้ดาวน์โหลด</p>
      </header>
      <article className="prose">
        <h2>ระหว่างนี้ใช้วิธีส่งออก SVG</h2>
        <ol>
          <li>เลือกข้อความหรือโลโก้ในไฟล์งาน แปลงตัวอักษรเป็นเส้น (Create Outlines หรือ Convert to Curves)</li>
          <li>แปลงเส้นขอบเป็นรูปทรง (Outline Stroke) เพื่อให้ทุกส่วนเป็นพื้นที่ปิด</li>
          <li>ส่งออกเป็น SVG แล้วเปิดตัวออกแบบ เลือกไฟล์ SVG ในขั้นที่ 1</li>
          <li>ตั้งความสูงชิ้นงานเป็นมิลลิเมตร ขนาดใน SVG จะถูกปรับตามความสูงนี้</li>
        </ol>
        <p>
          <Link href="/app" className="btn btn-primary">เปิดตัวออกแบบ <Icon name="arrow" size={16} /></Link>
        </p>
      </article>
    </div>
  )
}

export function Contact() {
  useTitle('ติดต่อเรา')
  return (
    <div className="page page-read">
      <header className="page-head">
        <h1>ติดต่อเรา</h1>
        <p>ข้อมูลติดต่อของ JJDesign ยังไม่ได้ใส่ เจ้าของเว็บต้องเพิ่มเบอร์โทร LINE และอีเมลจริงก่อนเปิดใช้งาน</p>
      </header>
      <table className="spec spec-wide">
        <tbody>
          <tr><th>โทรศัพท์</th><td>รอข้อมูลจากเจ้าของร้าน</td></tr>
          <tr><th>LINE</th><td>รอข้อมูลจากเจ้าของร้าน</td></tr>
          <tr><th>อีเมล</th><td>รอข้อมูลจากเจ้าของร้าน</td></tr>
          <tr><th>เวลาทำการ</th><td>รอข้อมูลจากเจ้าของร้าน</td></tr>
        </tbody>
      </table>
    </div>
  )
}

export function Legal({ kind }: { kind: 'terms' | 'privacy' }) {
  const terms = kind === 'terms'
  useTitle(terms ? 'เงื่อนไขการใช้งาน' : 'นโยบายความเป็นส่วนตัว')
  return (
    <div className="page page-read">
      <header className="page-head">
        <h1>{terms ? 'เงื่อนไขการใช้งาน' : 'นโยบายความเป็นส่วนตัว'}</h1>
        <p>ฉบับร่างสำหรับเวอร์ชันทดลอง ต้องให้ผู้เชี่ยวชาญด้านกฎหมายตรวจก่อนเปิดให้บริการจริง</p>
      </header>
      <article className="prose">
        {terms ? (
          <>
            <p>JJDesign เป็นเครื่องมือช่วยออกแบบ ผู้ใช้ต้องตรวจขนาด ความแข็งแรง และความปลอดภัยทางไฟฟ้าของชิ้นงานก่อนผลิตและติดตั้งทุกครั้ง</p>
            <p>ไฟล์ที่ผู้ใช้สร้างจากข้อความหรือโลโก้ของตนเป็นของผู้ใช้ ผู้ใช้ต้องมีสิทธิ์ในโลโก้ ฟอนต์ และข้อความที่นำมาใช้</p>
            <p>เครดิต บัญชี และการชำระเงินบนเว็บนี้เป็นการสาธิต ไม่มีมูลค่าเป็นเงินและไม่สามารถแลกคืนได้</p>
          </>
        ) : (
          <>
            <p>เวอร์ชันทดลองนี้ไม่มีเซิร์ฟเวอร์เก็บข้อมูล ข้อความ ไฟล์ SVG รูปภาพ ฟอนต์ และไฟล์งานที่คุณใช้ ประมวลผลในเบราว์เซอร์ของคุณเท่านั้น</p>
            <p>ชื่อและอีเมลที่ใส่ในบัญชีทดลอง รวมถึงเครดิตและตะกร้า ถูกเก็บใน localStorage ของเบราว์เซอร์นี้ ลบได้ด้วยการออกจากระบบหรือล้างข้อมูลเว็บไซต์</p>
            <p>หน้าเว็บโหลดฟอนต์ตัวอักษรของหน้าเว็บจาก Google Fonts ซึ่งอาจบันทึกข้อมูลการเข้าถึงตามนโยบายของ Google</p>
          </>
        )}
      </article>
    </div>
  )
}
