import { modelSize, partsList, partStats } from './exportModel'
import { stripLength } from './lightbox'
import { printGuide } from './printTips'
import type { SignPart } from './styles'

export function lightboxReadme(parts: SignPart[]) {
  const listed = partStats(parts)
  const list = partsList(listed)
  const size = modelSize(parts)
  return [
    `JJDesign — กล่องไฟจากรูป`,
    `ขนาด ${size.w.toFixed(1)} × ${size.h.toFixed(1)} มม. ลึก ${size.d.toFixed(1)} มม.`,
    '',
    list,
    '',
    'วิธีพิมพ์หน้า: เปิดแผ่นกระจายแสงกับไฟล์สีทุกสีพร้อมกันเป็นชิ้นเดียว (ตำแหน่งตรงกันทุกไฟล์) กำหนดเส้นพลาสติกให้แต่ละชิ้น',
    'แล้วพลิกคว่ำให้ด้านสีอยู่บนฐานพิมพ์ แผ่นกระจายแสงใช้เส้นสีขาว',
    'กรอบข้างพิมพ์ตั้งตรง ฝาหลังสวมเข้าด้านในกรอบ แผ่นหน้ามีขอบสวมลงในกรอบ ถอดเปลี่ยนไฟได้',
    `ไฟเส้น LED รอบด้านในกรอบยาวประมาณ ${(stripLength(parts) / 10).toFixed(0)} ซม.`,
    '',
    printGuide(listed),
    '',
    'ไฟล์ทุกไฟล์หน่วยมิลลิเมตร แกน Z ชี้ออกด้านหน้า',
    '',
  ].join('\n')
}
