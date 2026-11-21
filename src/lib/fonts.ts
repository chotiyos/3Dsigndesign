export type FontGroup = 'thai' | 'latin' | 'regional'

export interface FontOption {
  id: string
  label: string
  note: string
  url: string
  /** Which menu group it appears under. */
  group: FontGroup
}

/** Menu headings for the font groups. */
export const FONT_GROUPS: { id: FontGroup; label: string }[] = [
  { id: 'thai', label: 'ไทยและอังกฤษ' },
  { id: 'latin', label: 'อังกฤษและตัวเลขเท่านั้น' },
  { id: 'regional', label: 'ลาว พม่า เขมร เวียดนาม' },
]

/**
 * Fonts with Thai, for signs and names. All are SIL Open Font License fonts
 * from Google Fonts; licence texts are in /fonts/OFL-*.txt.
 */
export const THAI_FONTS: FontOption[] = [
  { id: 'kanit-bold', label: 'Kanit หนา', note: 'ทันสมัย อ่านง่ายจากระยะไกล ยอดนิยมป้ายไทย', url: '/fonts/Kanit-Bold.ttf', group: 'thai' },
  { id: 'prompt-bold', label: 'Prompt หนา', note: 'เรขาคณิต เส้นเท่ากัน', url: '/fonts/Prompt-Bold.ttf', group: 'thai' },
  { id: 'sarabun-extrabold', label: 'Sarabun หนาพิเศษ', note: 'มีหัว ดูเป็นทางการ', url: '/fonts/Sarabun-ExtraBold.ttf', group: 'thai' },
  { id: 'mitr-semibold', label: 'Mitr กึ่งหนา', note: 'มุมมน เป็นมิตร', url: '/fonts/Mitr-SemiBold.ttf', group: 'thai' },
  { id: 'chakra-petch-bold', label: 'Chakra Petch หนา', note: 'เหลี่ยมคม แนวเทคโนโลยี', url: '/fonts/ChakraPetch-Bold.ttf', group: 'thai' },
  { id: 'itim', label: 'Itim', note: 'ลายมือ น่ารัก', url: '/fonts/Itim-Regular.ttf', group: 'thai' },
  { id: 'chonburi', label: 'Chonburi', note: 'ดิสเพลย์ไทย หัวหนา เด่นบนป้ายร้าน', url: '/fonts/Chonburi-Regular.ttf', group: 'thai' },
  { id: 'charmonman-bold', label: 'Charmonman หนา', note: 'สคริปต์ลายมือ โค้งสวย เหมาะกับชื่อ', url: '/fonts/Charmonman-Bold.ttf', group: 'thai' },
  { id: 'srisakdi-bold', label: 'Srisakdi หนา', note: 'ลายเส้นประดิษฐ์ โดดเด่น', url: '/fonts/Srisakdi-Bold.ttf', group: 'thai' },
  { id: 'pridi-bold', label: 'Pridi หนา', note: 'เซอริฟไทย หรูหรา คลาสสิก', url: '/fonts/Pridi-Bold.ttf', group: 'thai' },
  { id: 'mali-bold', label: 'Mali หนา', note: 'ลายมือเด็ก กลมน่ารัก', url: '/fonts/Mali-Bold.ttf', group: 'thai' },
  { id: 'sriracha', label: 'Sriracha', note: 'ลายมือปากกา เป็นกันเอง', url: '/fonts/Sriracha-Regular.ttf', group: 'thai' },
  { id: 'pattaya', label: 'Pattaya', note: 'ดิสเพลย์ตัวหนา สนุกสนาน', url: '/fonts/Pattaya-Regular.ttf', group: 'thai' },
  { id: 'bai-jamjuree-bold', label: 'Bai Jamjuree หนา', note: 'เหลี่ยมโมเดิร์น อ่านง่าย', url: '/fonts/BaiJamjuree-Bold.ttf', group: 'thai' },
  { id: 'k2d-extrabold', label: 'K2D หนาพิเศษ', note: 'เรียบ กว้าง ทันสมัย', url: '/fonts/K2D-ExtraBold.ttf', group: 'thai' },
  { id: 'athiti-bold', label: 'Athiti หนา', note: 'เพรียว สุภาพ', url: '/fonts/Athiti-Bold.ttf', group: 'thai' },
]

/** Latin-only fonts: chunky display faces, condensed headlines and scripts. */
export const DISPLAY_FONTS: FontOption[] = [
  { id: 'coiny', label: 'Coiny', note: 'อ้วนกลม', url: '/fonts/Coiny-Regular.ttf', group: 'latin' },
  { id: 'cherry-bomb', label: 'Cherry Bomb One', note: 'การ์ตูนอ้วน', url: '/fonts/CherryBombOne-Regular.ttf', group: 'latin' },
  { id: 'lilita', label: 'Lilita One', note: 'หนาแน่น ตัวป้ายกีฬา', url: '/fonts/LilitaOne-Regular.ttf', group: 'latin' },
  { id: 'fredoka', label: 'Fredoka หนา', note: 'มนกลม', url: '/fonts/Fredoka-Bold.ttf', group: 'latin' },
  { id: 'pacifico', label: 'Pacifico', note: 'ตัวเขียน', url: '/fonts/Pacifico-Regular.ttf', group: 'latin' },
  { id: 'bebas-neue', label: 'Bebas Neue', note: 'คอนเดนส์หนา ป้ายร้าน', url: '/fonts/BebasNeue-Regular.ttf', group: 'latin' },
  { id: 'anton', label: 'Anton', note: 'หนาพิเศษ พาดหัว', url: '/fonts/Anton-Regular.ttf', group: 'latin' },
  { id: 'archivo-black', label: 'Archivo Black', note: 'หนาเต็ม อ่านชัด', url: '/fonts/ArchivoBlack-Regular.ttf', group: 'latin' },
  { id: 'poppins-bold', label: 'Poppins หนา', note: 'เรขาคณิต โมเดิร์น', url: '/fonts/Poppins-Bold.ttf', group: 'latin' },
  { id: 'righteous', label: 'Righteous', note: 'เรโทร มนเหลี่ยม', url: '/fonts/Righteous-Regular.ttf', group: 'latin' },
  { id: 'bungee', label: 'Bungee', note: 'ป้ายถนน ตัวใหญ่หนา', url: '/fonts/Bungee-Regular.ttf', group: 'latin' },
  { id: 'lobster', label: 'Lobster', note: 'สคริปต์หนา วินเทจ', url: '/fonts/Lobster-Regular.ttf', group: 'latin' },
]

/** Neighbouring languages, for shops that sign in Lao, Burmese, Khmer or Vietnamese. */
export const REGIONAL_FONTS: FontOption[] = [
  { id: 'be-vietnam-pro', label: 'Be Vietnam Pro หนาพิเศษ', note: 'ละติน/เวียดนาม วรรณยุกต์สวย', url: '/fonts/BeVietnamPro-ExtraBold.ttf', group: 'regional' },
  { id: 'phetsarath-bold', label: 'Phetsarath หนา', note: 'ลาว ฟอนต์มาตรฐาน (ไม่มีอักษรอังกฤษ)', url: '/fonts/Phetsarath-Bold.ttf', group: 'regional' },
  { id: 'padauk-bold', label: 'Padauk หนา', note: 'พม่า ยอดนิยม', url: '/fonts/Padauk-Bold.ttf', group: 'regional' },
  { id: 'battambang-bold', label: 'Battambang หนา', note: 'เขมร แบบดั้งเดิม', url: '/fonts/Battambang-Bold.ttf', group: 'regional' },
  { id: 'koulen', label: 'Koulen', note: 'เขมร ตัวหนาพาดหัว ป้ายร้าน', url: '/fonts/Koulen-Regular.ttf', group: 'regional' },
  { id: 'moul', label: 'Moul', note: 'เขมร ลายประดิษฐ์แบบป้ายดั้งเดิม', url: '/fonts/Moul-Regular.ttf', group: 'regional' },
]

/** Every font, in menu order: Thai first (Kanit stays the default), then Latin, then regional. */
export const FONT_OPTIONS: FontOption[] = [...THAI_FONTS, ...DISPLAY_FONTS, ...REGIONAL_FONTS]

export const CUSTOM_FONT_ID = 'custom'

/** Every font the gifts catalogue offers. */
export const GIFT_FONTS: FontOption[] = FONT_OPTIONS
