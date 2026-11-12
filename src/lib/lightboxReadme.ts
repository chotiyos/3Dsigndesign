import { modelSize, partsList, partStats } from './exportModel'
import { stripLength } from './lightbox'
import { printGuide } from './printTips'
import type { SignPart } from './styles'

export function lightboxReadme(parts: SignPart[]) {
  const listed = partStats(parts)
  const list = partsList(listed)
  const size = modelSize(parts)
  const cut = parts.filter((part) => part.cut)
  // A flat cut face has no plug ring: its solid is a plain slab (it carries a profile).
  const sheetFace = parts.some((part) => part.label === 'แผ่นกระจายแสง' && part.cut && part.profile)
  return [
    `JJDesign — กล่องไฟจากรูป`,
    `ขนาด ${size.w.toFixed(1)} × ${size.h.toFixed(1)} มม. ลึก ${size.d.toFixed(1)} มม.`,
    '',
    list,
    '',
    ...(sheetFace
      ? [
          'แผ่นกระจายแสงเป็นแผ่นตัด (ไฟล์ DXF) วางทับขอบหน้ากรอบ ยึดด้วยกาวหรือเทปกาวสองหน้าใส',
          'ชั้นสีพิมพ์แยกเป็นแผ่นบาง วางคว่ำบนฐานพิมพ์ แล้วติดบนแผ่นกระจายแสงตามตำแหน่งในไฟล์',
        ]
      : [
          'วิธีพิมพ์หน้า: เปิดแผ่นกระจายแสงกับไฟล์สีทุกสีพร้อมกันเป็นชิ้นเดียว (ตำแหน่งตรงกันทุกไฟล์) กำหนดเส้นพลาสติกให้แต่ละชิ้น',
          'แล้วพลิกคว่ำให้ด้านสีอยู่บนฐานพิมพ์ แผ่นกระจายแสงใช้เส้นสีขาว',
        ]),
    'กรอบข้างพิมพ์ตั้งตรง ฝาหลังสวมเข้าด้านในกรอบ' + (sheetFace ? '' : ' แผ่นหน้ามีขอบสวมลงในกรอบ ถอดเปลี่ยนไฟได้'),
    ...(cut.length ? ['', `ชิ้นที่ตัดจากแผ่น (ไฟล์ DXF ในโฟลเดอร์ของวัสดุ): ${cut.map((part) => `${part.code} ${part.label}`).join(', ')}`, 'ความหนาแผ่นให้ตรงกับที่ระบุในรายการชิ้นส่วน'] : []),
    `ไฟเส้น LED รอบด้านในกรอบยาวประมาณ ${(stripLength(parts) / 10).toFixed(0)} ซม.`,
    '',
    printGuide(listed),
    '',
    'ไฟล์ทุกไฟล์หน่วยมิลลิเมตร แกน Z ชี้ออกด้านหน้า',
    '',
  ].join('\n')
}
