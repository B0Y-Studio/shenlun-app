// src/theme/tokens.ts

export const lightTokens = {
  bg:          '#F0EAD6',
  bgAlt:       '#E8DFC4',
  paper:       '#FFFBF0',
  paperDeep:   '#F5EBD0',
  ink:         '#1C1714',
  inkSoft:     '#3D332B',
  inkMuted:    '#8B7355',
  inkFaint:    '#B8A88A',
  brass:       '#C9A962',
  brassDeep:   '#A88B45',
  seal:        '#C04851',
  sealDeep:    '#8B2635',
  jade:        '#5A6B5C',
  border:      '#D4C49A',
  divider:     'rgba(201,169,98,0.3)',
};

export const darkTokens = {
  bg:          '#1C1714',
  bgAlt:       '#251E19',
  paper:       '#2A221C',
  paperDeep:   '#1C1714',
  ink:         '#E8DFD4',
  inkSoft:     '#B8A88A',
  inkMuted:    '#8B7355',
  inkFaint:    '#5A4A3A',
  brass:       '#C9A962',
  brassDeep:   '#A88B45',
  seal:        '#C04851',
  sealDeep:    '#8B2635',
  jade:        '#5A6B5C',
  border:      '#3D332B',
  divider:     'rgba(201,169,98,0.2)',
};

export const fonts = {
  // 思源宋体：4 个字重打包到 android/app/src/main/assets/fonts/
  // OTF 内部 PostScript name 是 "SourceHanSerifCN-*"（不是 SC），
  // Android 按这个名字加载，文件名是 SC 仅是方便识别
  serif: {
    regular: 'SourceHanSerifCN-Regular',
    medium:  'SourceHanSerifCN-Medium',
    bold:    'SourceHanSerifCN-Bold',
    heavy:   'SourceHanSerifCN-Heavy',
  },
  kai: {
    regular: 'KaiTi',
    bold:    'KaiTi-Bold',
  },
  sans: {
    regular: 'PingFangSC-Regular',
    medium:  'PingFangSC-Medium',
  },
};

export const fontSizes = {
  hero: 32, title: 24, subtitle: 18,
  body: 16, bodyLg: 17, caption: 13,
  label: 11, micro: 10, seal: 12,
};

export const lineHeights = {
  tight: 1.2, normal: 1.5, prose: 1.85, loose: 2.0,
  // 阅读页正文行距
  reading: 1.75,
};

export const letterSpacings = {
  tight: -0.5, normal: 0, wide: 2, wider: 4,
};

export const spacing = {
  xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48,
};

export const radii = {
  none: 0, sm: 2, md: 4, pill: 999,
};

export const borders = {
  hair: 1,
};

export const shadows = {
  paper: {
    shadowColor: '#3D332B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  seal: {
    shadowColor: '#8B2635',
    shadowOffset: { width: 1, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 3,
  },
};

export const motion = {
  duration: { fast: 150, normal: 250, slow: 400, slowest: 600 },
};

// ─────────────────────────────────────────────────────────────
// 农历日期（V3 头部右侧）—— 4 字格：1–9 用汉字，10–19 用阿拉伯，
// 20–29 用 "X+廿+一~九"，30 用 "三十"
// ─────────────────────────────────────────────────────────────
const NUMBER_CN = ['零','一','二','三','四','五','六','七','八','九'];
const NUMBER_CN_UNIT = ['','十','二十','三十']; // 10/20/30

const MONTH_CN = ['正','二','三','四','五','六','七','八','九','十','冬','腊'];

export function lunarMonthCn(monthIdx: number): string {
  // monthIdx: 0-based (0 = 正月)
  return `${MONTH_CN[monthIdx]}月`;
}

export function lunarDayCn(day: number): string {
  // day: 1..30
  if (day === 10) return '初十';
  if (day === 20) return '二十';
  if (day === 30) return '三十';
  if (day < 10) return `初${NUMBER_CN[day]}`;
  if (day < 20) return `十${NUMBER_CN[day - 10]}`;
  // 21..29
  return `廿${NUMBER_CN[day - 20]}`;
}

// 公历"日"汉字表达：1..31 → 汉字
// 1-9: 一/二/.../九
// 10: 十；11-19: 十一/十二/.../十九
// 20: 二十；21-29: 二十一/二十二/.../二十九
// 30: 三十；31: 三十一
export function solarDayCn(day: number): string {
  if (day < 10) return NUMBER_CN[day];
  if (day === 10) return '十';
  if (day < 20) return `十${NUMBER_CN[day - 10]}`;
  if (day === 20) return '二十';
  if (day < 30) return `二十${NUMBER_CN[day - 20]}`;
  if (day === 30) return '三十';
  if (day === 31) return '三十一';
  return `${day}`;
}

// 数字 1-12 转中文数字（用于公历月份）
const GREGORIAN_MONTH_CN = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];

// 把 Date 转成 V3 顶部右侧 4 字表达（中文月/日）
// line1="X月"（汉字月，如"七月"），line2="汉字日"（公历日转汉字，如"十四"）
export function buildHeaderDate(d: Date): { line1: string; line2: string } {
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return { line1: `${GREGORIAN_MONTH_CN[m]}月`, line2: solarDayCn(day) };
}

// ─────────────────────────────────────────────────────────────
// 锦言库（V3 锦言卡 + 换一句），写在 token 层以便任何屏复用
// ─────────────────────────────────────────────────────────────
export interface Quote {
  text: string;
  src: string;
}
export const QUOTES: Quote[] = [
  { text: '敢于负责、敢于担当，敢于闯出新路，敢于打破常规。', src: '— 习近平 · 二〇二三' },
  { text: '事者，生于虑，成于务，失于傲。', src: '—《管子·乘马》' },
  { text: '为者常成，行者常至。', src: '—《晏子春秋》' },
  { text: '功崇惟志，业广惟勤。', src: '—《尚书》' },
  { text: '志不立，天下无可成之事。', src: '— 王阳明' },
  { text: '学如逆水行舟，不进则退；心似平原走马，易放难收。', src: '—《古今贤文》' },
];

// ─────────────────────────────────────────────────────────────
// 主菜单 5 项配置（V3 首页中央菜单）
// ─────────────────────────────────────────────────────────────
export interface MenuItem {
  key: string;
  index: string;             // 壹、贰 ...
  indexColor: 'seal' | 'brass' | 'jade' | 'sealDeep' | 'ink';
  title: string;
  subtitle: string;
}
export const MENU_ITEMS: MenuItem[] = [
  { key: 'review',  index: '壹', indexColor: 'seal',     title: '复盘回顾', subtitle: '本周精读 · 金句本 · 错题归档' },
  { key: 'source',  index: '贰', indexColor: 'brass',    title: '素材学习', subtitle: '政策理论 · 基层治理 · 数字中国' },
  { key: 'paper',   index: '叁', indexColor: 'jade',     title: '题目练习', subtitle: '未答 · 国考 / 联考 / 申论' },
  { key: 'analysis',index: '肆', indexColor: 'sealDeep', title: '分析建议', subtitle: '薄弱题型 · 高频考点 · AI 评卷' },
  { key: 'note',    index: '伍', indexColor: 'ink',      title: '积累笔记', subtitle: '按主题、来源、日期回顾' },
];

// ─────────────────────────────────────────────────────────────
// 底部 Tab（V3 TabBar）
// ─────────────────────────────────────────────────────────────
export interface TabItem {
  key: string;
  label: string;             // 楷体显示的 2 字
}
export const TAB_ITEMS: TabItem[] = [
  { key: 'home',     label: '积累' },
  { key: 'source',   label: '素材' },
  { key: 'paper',    label: '题目' },
  { key: 'analysis', label: '分析' },
  { key: 'settings', label: '设置' },
];
