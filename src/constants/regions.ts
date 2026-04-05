export interface CnbsRegion {
  code: string;
  name: string;
  shortName: string;
  level: 'province' | 'city' | 'county';
}

export const CNBS_REGIONS: CnbsRegion[] = [
  { code: '000000000000', name: '全国', shortName: '全国', level: 'province' },
  { code: '110000000000', name: '北京市', shortName: '北京', level: 'province' },
  { code: '120000000000', name: '天津市', shortName: '天津', level: 'province' },
  { code: '130000000000', name: '河北省', shortName: '河北', level: 'province' },
  { code: '140000000000', name: '山西省', shortName: '山西', level: 'province' },
  { code: '150000000000', name: '内蒙古自治区', shortName: '内蒙古', level: 'province' },
  { code: '210000000000', name: '辽宁省', shortName: '辽宁', level: 'province' },
  { code: '220000000000', name: '吉林省', shortName: '吉林', level: 'province' },
  { code: '230000000000', name: '黑龙江省', shortName: '黑龙江', level: 'province' },
  { code: '310000000000', name: '上海市', shortName: '上海', level: 'province' },
  { code: '320000000000', name: '江苏省', shortName: '江苏', level: 'province' },
  { code: '330000000000', name: '浙江省', shortName: '浙江', level: 'province' },
  { code: '340000000000', name: '安徽省', shortName: '安徽', level: 'province' },
  { code: '350000000000', name: '福建省', shortName: '福建', level: 'province' },
  { code: '360000000000', name: '江西省', shortName: '江西', level: 'province' },
  { code: '370000000000', name: '山东省', shortName: '山东', level: 'province' },
  { code: '410000000000', name: '河南省', shortName: '河南', level: 'province' },
  { code: '420000000000', name: '湖北省', shortName: '湖北', level: 'province' },
  { code: '430000000000', name: '湖南省', shortName: '湖南', level: 'province' },
  { code: '440000000000', name: '广东省', shortName: '广东', level: 'province' },
  { code: '450000000000', name: '广西壮族自治区', shortName: '广西', level: 'province' },
  { code: '460000000000', name: '海南省', shortName: '海南', level: 'province' },
  { code: '500000000000', name: '重庆市', shortName: '重庆', level: 'province' },
  { code: '510000000000', name: '四川省', shortName: '四川', level: 'province' },
  { code: '520000000000', name: '贵州省', shortName: '贵州', level: 'province' },
  { code: '530000000000', name: '云南省', shortName: '云南', level: 'province' },
  { code: '540000000000', name: '西藏自治区', shortName: '西藏', level: 'province' },
  { code: '610000000000', name: '陕西省', shortName: '陕西', level: 'province' },
  { code: '620000000000', name: '甘肃省', shortName: '甘肃', level: 'province' },
  { code: '630000000000', name: '青海省', shortName: '青海', level: 'province' },
  { code: '640000000000', name: '宁夏回族自治区', shortName: '宁夏', level: 'province' },
  { code: '650000000000', name: '新疆维吾尔自治区', shortName: '新疆', level: 'province' },
  { code: '710000000000', name: '台湾省', shortName: '台湾', level: 'province' },
  { code: '810000000000', name: '香港特别行政区', shortName: '香港', level: 'province' },
  { code: '820000000000', name: '澳门特别行政区', shortName: '澳门', level: 'province' },
];

export const CNBS_CATEGORY_INFO: Record<string, { name: string; code: string; dtType: string }> = {
  '1': { name: '月度数据', code: '1', dtType: 'MM' },
  '2': { name: '季度数据', code: '2', dtType: 'SS' },
  '3': { name: '年度数据', code: '3', dtType: 'YY' },
  '5': { name: '分省季度数据', code: '5', dtType: 'SS' },
  '6': { name: '分省年度数据', code: '6', dtType: 'YY' },
  '7': { name: '其他数据', code: '7', dtType: 'YY' },
  '8': { name: '主要城市年度数据', code: '8', dtType: 'YY' },
  '9': { name: '港澳台月度数据', code: '9', dtType: 'MM' },
  '10': { name: '港澳台年度数据', code: '10', dtType: 'YY' },
  '11': { name: '主要国家(地区)月度数据', code: '11', dtType: 'MM' },
  '12': { name: '三大经济体月度数据', code: '12', dtType: 'MM' },
  '14': { name: '主要国家(地区)年度数据', code: '14', dtType: 'YY' },
  '32': { name: '澳门特别行政区年度数据', code: '32', dtType: 'YY' },
};

export function getRegionByCode(code: string): CnbsRegion | undefined {
  return CNBS_REGIONS.find(r => r.code === code);
}

export function getRegionByName(name: string): CnbsRegion | undefined {
  return CNBS_REGIONS.find(r => 
    r.name === name || 
    r.shortName === name || 
    r.name.includes(name) ||
    name.includes(r.shortName)
  );
}

export function searchRegions(keyword: string): CnbsRegion[] {
  const lowerKeyword = keyword.toLowerCase();
  return CNBS_REGIONS.filter(r =>
    r.name.toLowerCase().includes(lowerKeyword) ||
    r.shortName.toLowerCase().includes(lowerKeyword) ||
    r.code.includes(keyword)
  );
}
