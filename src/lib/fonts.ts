export interface FontOption {
  id: string
  label: string
  note: string
  url: string
}

/** Fonts shipped with the site. All are SIL Open Font License fonts from Google Fonts. */
export const FONT_OPTIONS: FontOption[] = [
  { id: 'kanit-bold', label: 'Kanit หนา', note: 'ทันสมัย อ่านง่ายจากระยะไกล', url: '/fonts/Kanit-Bold.ttf' },
  { id: 'prompt-bold', label: 'Prompt หนา', note: 'เรขาคณิต เส้นเท่ากัน', url: '/fonts/Prompt-Bold.ttf' },
  { id: 'sarabun-extrabold', label: 'Sarabun หนาพิเศษ', note: 'มีหัว ดูเป็นทางการ', url: '/fonts/Sarabun-ExtraBold.ttf' },
  { id: 'mitr-semibold', label: 'Mitr กึ่งหนา', note: 'มุมมน เป็นมิตร', url: '/fonts/Mitr-SemiBold.ttf' },
  { id: 'chakra-petch-bold', label: 'Chakra Petch หนา', note: 'เหลี่ยมคม แนวเทคโนโลยี', url: '/fonts/ChakraPetch-Bold.ttf' },
  { id: 'itim', label: 'Itim', note: 'ลายมือ น่ารัก', url: '/fonts/Itim-Regular.ttf' },
]

export const CUSTOM_FONT_ID = 'custom'

/**
 * Chunky display fonts for the gifts catalogue (Latin only; Thai text uses the
 * fonts above). SIL Open Font License; licence texts are in /fonts/OFL-*.txt.
 */
export const DISPLAY_FONTS: FontOption[] = [
  { id: 'coiny', label: 'Coiny', note: 'อ้วนกลม อังกฤษ', url: '/fonts/Coiny-Regular.ttf' },
  { id: 'cherry-bomb', label: 'Cherry Bomb One', note: 'การ์ตูนอ้วน อังกฤษ', url: '/fonts/CherryBombOne-Regular.ttf' },
  { id: 'lilita', label: 'Lilita One', note: 'หนาแน่น ตัวป้ายกีฬา อังกฤษ', url: '/fonts/LilitaOne-Regular.ttf' },
  { id: 'fredoka', label: 'Fredoka หนา', note: 'มนกลม อังกฤษ', url: '/fonts/Fredoka-Bold.ttf' },
  { id: 'pacifico', label: 'Pacifico', note: 'ตัวเขียน อังกฤษ', url: '/fonts/Pacifico-Regular.ttf' },
]

/** Every font the gifts catalogue offers: display fonts first, then the Thai-capable ones. */
export const GIFT_FONTS: FontOption[] = [...DISPLAY_FONTS, ...FONT_OPTIONS]
