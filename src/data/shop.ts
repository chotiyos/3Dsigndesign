/**
 * Demo catalogue. Every price, product, and stock figure here is a placeholder
 * for the shop owner to replace; the site labels them as examples.
 */
export interface ReadyFile {
  id: string
  styleId: string
  text: string
  title: string
  note: string
  values?: Record<string, number>
}

export const READY_FILES: ReadyFile[] = [
  { id: 'open-sign', styleId: 'front-lit-lip', text: 'OPEN', title: 'ป้ายไฟ OPEN หน้าร้าน', note: 'ขนาดตัวอักษร 150 มม. ไฟหน้า มีบ่ารับอะคริลิก' },
  { id: 'cafe-halo', styleId: 'halo-back-lit', text: 'CAFE', title: 'ป้ายไฟออกหลัง CAFE', note: 'อักษรทึบ ไฟส่องผนัง ติดหมุดลอย' },
  { id: 'welcome-desk', styleId: 'desk-block', text: 'ยินดีต้อนรับ', title: 'ป้ายยินดีต้อนรับตั้งโต๊ะ', note: 'แท่นฐานพิมพ์ชิ้นเดียว' },
  { id: 'wifi-curl', styleId: 'desk-curl', text: 'WiFi', title: 'ป้าย WiFi แผ่นโค้ง', note: 'ตั้งบนเคาน์เตอร์ แผ่นโค้งเป็นขาในตัว' },
  { id: 'number-mini', styleId: 'mini-cup', text: '88', title: 'เลขที่บ้านไฟจิ๋ว', note: 'ถ้วยพิมพ์ชิ้นเดียว ฝาหน้าสวม' },
  { id: 'love-keychain', styleId: 'keychain-outline', text: 'LOVE', title: 'พวงกุญแจ LOVE', note: 'พิมพ์สองสี มีห่วง' },
  { id: 'thai-keycap', styleId: 'keycap', text: 'ก', title: 'ปุ่มคีย์บอร์ด ก', note: 'สวมแกนสวิตช์มาตรฐาน' },
  { id: 'bar-bottle', styleId: 'bottle-box', text: 'BAR', title: 'กล่องไฟขวด BAR', note: 'ตู้ไฟทรงขวด ข้อความบนฉลาก' },
  { id: 'gear-24', styleId: 'spur-gear', text: '', title: 'เฟือง 24 ฟัน โมดูล 2', note: 'รูแกน 8 มม. มีร่องลิ่ม' },
  { id: 'jar-60', styleId: 'screw-jar', text: '', title: 'กระปุกฝาเกลียว 60 มม.', note: 'ฝาขันปิดได้จริง' },
  { id: 'hook-80', styleId: 'hook', text: '', title: 'ตะขอแขวน 80 มม.', note: 'รูยึดสกรูด้านบน' },
  { id: 'chain-8', styleId: 'chain', text: '', title: 'โซ่ 8 ข้อ', note: 'พิมพ์ทีเดียวทั้งเส้น' },
]

export interface Material {
  id: string
  category: string
  name: string
  spec: string
  unit: string
  price: number
  swatch: string
}

export const MATERIALS: Material[] = [
  { id: 'petg-white', category: 'เส้นพิมพ์ 3D', name: 'เส้น PETG ขาวขุ่นกระจายแสง', spec: '1.75 มม. ม้วน 1 กก.', unit: 'ม้วน', price: 450, swatch: '#f4f6fb' },
  { id: 'petg-black', category: 'เส้นพิมพ์ 3D', name: 'เส้น PETG ดำด้าน', spec: '1.75 มม. ม้วน 1 กก.', unit: 'ม้วน', price: 420, swatch: '#1c1f26' },
  { id: 'pla-gold', category: 'เส้นพิมพ์ 3D', name: 'เส้น PLA สีทองเงา', spec: '1.75 มม. ม้วน 1 กก.', unit: 'ม้วน', price: 520, swatch: '#c9a23a' },
  { id: 'acrylic-opal-3', category: 'แผ่นอะคริลิก', name: 'อะคริลิกขาวนม 3 มม.', spec: '60 × 120 ซม.', unit: 'แผ่น', price: 690, swatch: '#f7f7f3' },
  { id: 'acrylic-clear-3', category: 'แผ่นอะคริลิก', name: 'อะคริลิกใส 3 มม.', spec: '60 × 120 ซม.', unit: 'แผ่น', price: 640, swatch: '#cfe2ff' },
  { id: 'acrylic-mirror', category: 'แผ่นอะคริลิก', name: 'อะคริลิกกระจกเงา 2 มม.', spec: '60 × 120 ซม.', unit: 'แผ่น', price: 820, swatch: '#b9c4d2' },
  { id: 'plaswood-5', category: 'พลาสวูด', name: 'พลาสวูดขาว 5 มม.', spec: '120 × 240 ซม.', unit: 'แผ่น', price: 560, swatch: '#f2f1ea' },
  { id: 'led-module', category: 'ไฟ LED', name: 'โมดูล LED 3 ดวง 12V ขาว', spec: 'แพ็ก 20 ชิ้น', unit: 'แพ็ก', price: 180, swatch: '#ffe9a8' },
  { id: 'led-strip', category: 'ไฟ LED', name: 'ไฟเส้น LED 12V ขาวนวล', spec: 'ม้วน 5 เมตร', unit: 'ม้วน', price: 260, swatch: '#ffd98a' },
  { id: 'neon-flex', category: 'ไฟ LED', name: 'ไฟเส้นนีออนดัดได้ 6 × 12 มม.', spec: 'ม้วน 5 เมตร', unit: 'ม้วน', price: 690, swatch: '#ff8fb0' },
  { id: 'psu-12v', category: 'ไฟ LED', name: 'หม้อแปลง 12V 5A', spec: 'สำหรับป้ายขนาดกลาง', unit: 'ตัว', price: 290, swatch: '#9aa4b2' },
  { id: 'standoff', category: 'อุปกรณ์ติดตั้ง', name: 'หมุดลอยสแตนเลส 12 × 20 มม.', spec: 'แพ็ก 10 ชุด', unit: 'แพ็ก', price: 220, swatch: '#c0c7d1' },
]

export const PACKS = [
  { id: 'starter', credits: 100, price: 99, note: 'ลองงานแรก' },
  { id: 'shop', credits: 600, price: 490, note: 'ร้านป้ายทั่วไป' },
  { id: 'factory', credits: 1500, price: 990, note: 'งานต่อเนื่องทั้งเดือน' },
]
