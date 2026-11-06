import type { PartStat } from './exportModel'
import { MATERIAL_NAMES } from '../three/materials'

/**
 * Starting print or cut settings for one part, from its material, how it is
 * made and how thick it is. Common starting points for FDM printers and sheet
 * cutting, to adjust for each machine and filament.
 */
export function printTip({ part, size }: Pick<PartStat, 'part' | 'size'>): string {
  const thick = part.profile?.depth ?? size.z
  if (part.material === 'led') return 'ซื้อสำเร็จ ไฟล์นี้ใช้ดูตำแหน่งและความยาวเท่านั้น ไม่ต้องพิมพ์'
  if (part.cut) {
    return `ตัดเลเซอร์หรือ CNC จากแผ่น${MATERIAL_NAMES[part.material]} หนา ${thick.toFixed(1)} มม. ใช้ไฟล์ DXF ชดเชยรอยตัด (kerf) ตามเครื่อง ลอกฟิล์มหลังตัด`
  }
  switch (part.material) {
    case 'opalprint':
      return 'เส้น PETG สีขาว ชั้น 0.2 มม. เติมเต็ม 100% ให้แสงผ่านสม่ำเสมอ ไม่ต้องใช้ซัพพอร์ต'
    case 'accent':
      return thick <= 1.5
        ? 'ชั้นสีบาง: ชั้น 0.2 มม. เติมเต็ม 100% พิมพ์พร้อมชิ้นที่วางทับ (หลายสี) ตำแหน่งในไฟล์ตรงกันอยู่แล้ว'
        : 'ชั้น 0.2 มม. ผนัง 3 เส้น เติม 15–20% วางด้านหลังติดฐานพิมพ์'
    case 'rubber':
      return 'เส้น TPU 95A ความเร็ว 20–30 มม./วินาที ดึงเส้นกลับ (retraction) น้อยหรือปิด เติม 20%'
    case 'metal':
      return 'พิมพ์ด้วยเส้นสีโลหะ (silk) ชั้น 0.16–0.2 มม. ผนัง 3 เส้น เติม 15% หรือส่งทำโลหะจริงตามขนาดในไฟล์'
    case 'acrylic':
    case 'opal':
    case 'mirror':
    case 'plaswood':
      return `หนา ${thick.toFixed(1)} มม. เกินกว่าจะตัดจากแผ่นเดียว ซ้อนแผ่นหลายชั้นแล้วติดกาว หรือเปลี่ยนเป็นวัสดุพิมพ์`
    default:
      return thick >= 20 && /ผนัง|กรอบ/.test(part.label)
        ? 'ชั้น 0.2 มม. ผนัง 3 เส้น เติม 15% ตั้งด้านหลังติดฐานพิมพ์ ไม่ต้องใช้ซัพพอร์ต'
        : 'ชั้น 0.2 มม. ผนัง 3 เส้น เติม 15–20% วางด้านแบนที่ใหญ่ที่สุดติดฐานพิมพ์'
  }
}

/** The print guide section of a ZIP's parts list. */
export function printGuide(stats: Pick<PartStat, 'part' | 'size'>[]): string {
  return [
    'วิธีพิมพ์และตัดที่แนะนำ (ค่าเริ่มต้น ปรับตามเครื่องและยี่ห้อเส้น)',
    ...stats.map((s) => `${s.part.code}  ${s.part.label}: ${printTip(s)}`),
    'ทดลองพิมพ์ชิ้นเล็กก่อนพิมพ์จริงทุกครั้ง ถ้าชิ้นใหญ่กว่าฐานพิมพ์ ให้ตัดแบ่งใน slicer แล้วต่อด้วยกาว',
  ].join('\n')
}
