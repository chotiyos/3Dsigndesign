# Aksign 3D

โปรเจกต์ต้นแบบ (คล้าย [Aksorn3D](https://aksorn3d.com)) สำหรับสร้างป้ายตัวอักษร 3D จากข้อความไทย/อังกฤษ
พิมพ์ข้อความในเบราว์เซอร์แล้วดูโมเดล 3D แบบเรียลไทม์ พร้อม export ไฟล์สำหรับผลิตจริง

## สถานะปัจจุบัน (MVP — ตัวออกแบบเสร็จครบ)

- [x] Text shaping ภาษาไทยที่ถูกต้อง (HarfBuzz ผ่าน `harfbuzzjs`) — สระ/วรรณยุกต์วางตำแหน่งตามฟอนต์จริง ไม่ใช่แค่วาง glyph เรียงกัน
- [x] Extrude ข้อความเป็นโมเดล 3D (Three.js) พร้อมปรับความสูง/ความลึก
- [x] สร้างชิ้นส่วนป้ายอัตโนมัติ (หน้าอะคริลิก / ผนังตัวอักษร / แผ่นหลัง) ด้วย polygon offset + boolean (clipper-lib)
- [x] Exploded view + toggle ซ่อน/โชว์แต่ละเลเยอร์
- [x] อัปโหลด SVG (ใช้แทนข้อความได้ รองรับรูที่มีช่องว่าง)
- [x] Export STL (พิมพ์ 3D) และ DXF (ตัดอะคริลิก/พลาสวูด)

ยังไม่ได้ทำ (นอกสโคป MVP): ระบบ auth/เครดิต/ชำระเงิน, ร้านไฟล์ 3D, ร้านวัสดุ, สไตล์ครบ 31 แบบ (ตอนนี้มีแบบเดียว: ไฟหน้าหงายมีบ่า แบบง่าย), จำลองไฟ LED, ภาษาเวียดนาม

## Stack

- React + TypeScript + Vite
- Three.js (เรนเดอร์ + extrude geometry + STL export)
- harfbuzzjs (WASM text shaping — จุดที่ทำให้สระ/วรรณยุกต์ไทยไม่ลอย)
- clipper-lib (polygon offset/boolean — สร้างผนังกลวงจากรูปตัวอักษร)
- Tailwind CSS

## Dev

```bash
npm install
npm run dev
```

เปิด http://localhost:5173
