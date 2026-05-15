// Test Unicode escape vs literal Chinese regex
const q = "中美关税变化";
console.log("Query:", q);

const termMap: [RegExp, string][] = [
  [/中美贸易战/g, 'US China trade war '], // 中美贸易战
  [/中美/g, 'US China '],                               // 中美
  [/关税/g, 'tariff '],                                  // 关税
  [/贸易战/g, 'trade war '],                         // 贸易战
  [/运价|运费/g, 'freight rate '],              // 运价|运费
  [/集装箱/g, 'container '],                         // 集装箱
  [/铜价|铜/g, 'copper price '],                     // 铜价|铜
  [/铝价|铝/g, 'aluminum price '],                   // 铝价|铝
  [/钢价|钢|螺纹钢/g, 'steel price '],  // 钢价|钢|螺纹钢
  [/碳价|碳关税/g, 'carbon price EUA '],    // 碳价|碳关税
  [/召回/g, 'product recall CPSC '],                     // 召回
  [/港口/g, 'port '],                                     // 港口
  [/供应链/g, 'supply chain '],                      // 供应链
  [/家电|小家电/g, 'appliance '],            // 家电|小家电
  [/出口/g, 'export '],                                   // 出口
  [/进口/g, 'import '],                                   // 进口
  [/变化|最新|动态|新闻|最近|有什么/g, ''],
  [/政策/g, 'policy '],                                   // 政策
];

let r = q;
for (const [re, en] of termMap) r = r.replace(re, en);
r = r.replace(/[一-鿿]+/g, ' ').replace(/\s+/g, ' ').trim();
console.log("Result:", r);
