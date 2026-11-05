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
