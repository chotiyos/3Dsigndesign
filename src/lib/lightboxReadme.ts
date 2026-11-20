import { modelSize, partsList, partStats } from './exportModel'
import { stripLength, type LightboxOptions } from './lightbox'
import { printGuide } from './printTips'
import type { SignPart } from './styles'

/** Whether a part's solid is just its flat sheet (no plug ring under it). */
function flatSheet(part: SignPart) {
  if (!part.profile) return false
  part.geometry.computeBoundingBox()
  const box = part.geometry.boundingBox
  return Boolean(box) && box!.max.z - box!.min.z <= part.profile.depth + 0.01
}

export function lightboxReadme(parts: SignPart[], o?: Pick<LightboxOptions, 'face' | 'sides' | 'shape' | 'rear'>) {
  const listed = partStats(parts)
  const list = partsList(listed)
  const size = modelSize(parts)
  const cut = parts.filter((part) => part.cut)
  const faces = parts.filter((part) => part.label.startsWith('แผ่นกระจายแสง'))
  // A face cut as DXF only is a flat sheet laid on the frame, with no plug ring.
  const sheetFace = faces.some((part) => part.cut && flatSheet(part))
  const double = parts.some((part) => part.label === 'แผ่นกระจายแสงหลัง')
  const layered = parts.some((part) => part.label.startsWith('สี '))
  const printedFace = faces.some((part) => !part.cut)
  const wire = (o?.rear.wire ?? 1) > 0
  const mirrored = o?.shape !== 'contour'
  return [
    `JJDesign — กล่องไฟจากรูป${double ? ' (ไฟออกหน้า-หลัง)' : ''}`,
    `ขนาด ${size.w.toFixed(1)} × ${size.h.toFixed(1)} มม. ลึก ${size.d.toFixed(1)} มม.`,
    '',
    list,
    '',
    ...(sheetFace ? ['แผ่นกระจายแสงเป็นแผ่นตัด (ไฟล์ DXF) วางทับขอบกรอบ ยึดด้วยกาวหรือเทปกาวสองหน้าใส'] : []),
    ...(layered && (sheetFace || !printedFace) ? ['ชั้นสีพิมพ์แยกเป็นแผ่นบาง วางคว่ำบนฐานพิมพ์ แล้วติดบนแผ่นกระจายแสงตามตำแหน่งในไฟล์'] : []),
    ...(layered && printedFace && !sheetFace
      ? [
          'วิธีพิมพ์แผ่นหน้า: เปิดแผ่นกระจายแสงกับไฟล์สีทุกสีพร้อมกันเป็นชิ้นเดียว (ตำแหน่งตรงกันทุกไฟล์) กำหนดเส้นพลาสติกให้แต่ละชิ้น',
          'แล้วพลิกคว่ำให้ด้านสีอยู่บนฐานพิมพ์ แผ่นกระจายแสงใช้เส้นสีขาว',
        ]
      : []),
    ...(!layered && printedFace && !sheetFace ? ['แผ่นกระจายแสงพิมพ์ด้วยเส้นสีขาว วางด้านเรียบติดฐานพิมพ์'] : []),
    double
      ? 'กรอบกับแผ่นกั้นกลางเป็นชิ้นเดียว พิมพ์ตั้งบนขอบล่าง (แผ่นกั้นตั้งเป็นผนัง ไม่ต้องใช้ซัพพอร์ต) ติดไฟเส้นแต่ละช่องชิดแผ่นกั้น' +
        (wire ? ' ร้อยสายเข้าทางช่องที่ผนัง แล้วผ่านรูแผ่นกั้นไปอีกช่อง' : '') +
        (sheetFace ? '' : ' แผ่นหน้าและแผ่นหลังมีขอบสวมลงในกรอบ ถอดเปลี่ยนไฟได้')
      : 'กรอบข้างพิมพ์ตั้งตรง ฝาหลังสวมเข้าด้านในกรอบ' + (sheetFace ? '' : ' แผ่นหน้ามีขอบสวมลงในกรอบ ถอดเปลี่ยนไฟได้'),
    ...(double && layered
      ? [mirrored
          ? 'ชั้นสีด้านหลังกลับซ้าย-ขวาไว้แล้ว มองจากด้านหลังอ่านถูก พิมพ์แบบเดียวกับด้านหน้า'
          : 'กล่องทรงตามรูปไม่สมมาตร ชั้นสีด้านหลังจึงตรงกับขอบกรอบ มองจากด้านหลังจะเห็นรูปกลับด้าน']
      : []),
    ...(double && !layered && o && o.face !== 'layers'
      ? [mirrored
          ? 'ลายพิมพ์ทำ 2 ชุด ด้านละชุด ใช้ไฟล์เดียวกันทั้งสองด้าน'
          : 'ลายพิมพ์ทำ 2 ชุด ด้านหน้าใช้ไฟล์ลายหน้าแผ่น ด้านหลังใช้ไฟล์ในโฟลเดอร์ ด้านหลัง (กลับด้านให้ตรงกับขอบกรอบ)']
      : []),
    ...(cut.length ? ['', `ชิ้นที่ตัดจากแผ่น (ไฟล์ DXF ในโฟลเดอร์ของวัสดุ): ${cut.map((part) => `${part.code} ${part.label}`).join(', ')}`, 'ความหนาแผ่นให้ตรงกับที่ระบุในรายการชิ้นส่วน'] : []),
    `ไฟเส้น LED รอบด้านในกรอบยาวประมาณ ${(stripLength(parts) / 10).toFixed(0)} ซม.${double ? ' ต่อฝั่ง (รวม 2 เส้น)' : ''}`,
    '',
    printGuide(listed),
    '',
    'ไฟล์ทุกไฟล์หน่วยมิลลิเมตร แกน Z ชี้ออกด้านหน้า',
    '',
  ].join('\n')
}
