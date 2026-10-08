/**
 * 全局可配置限额。可通过环境变量覆盖，均为正整数。
 */
export interface Limits {
  /** 十进制整数字符串允许的最大位数（防资源耗尽），默认 64。 */
  maxIntegerDigits: number;
  /** 交易列表分页每页最大条数，默认 100。 */
  maxPageSize: number;
  /** 批量回放验证每批最大条数，默认 500。 */
  maxVerifyBatch: number;
}

const FORMULA_VERSION = 'cpamm-fixed-input-v1';
const FEE_DENOMINATOR = 10000n;

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`环境变量 ${name} 必须是正整数，收到: ${raw}`);
  }
  return n;
}

export function loadLimits(): Limits {
  return {
    maxIntegerDigits: envInt('CPAMM_MAX_INTEGER_DIGITS', 64),
    maxPageSize: envInt('CPAMM_MAX_PAGE_SIZE', 100),
    maxVerifyBatch: envInt('CPAMM_MAX_VERIFY_BATCH', 500),
  };
}

export { FORMULA_VERSION, FEE_DENOMINATOR };
