import { FEE_DENOMINATOR } from './config.js';
import { ApiError } from './errors.js';

/** 兑换方向：X_TO_Y 表示用 X 资产换入 Y 资产。 */
export type Direction = 'X_TO_Y' | 'Y_TO_X';
export const DIRECTIONS: readonly Direction[] = ['X_TO_Y', 'Y_TO_X'];

/** 精确分数（BigInt 分子/分母，分母恒正，不做约分也保持精确）。 */
export interface Fraction {
  numerator: string;
  denominator: string;
}

/** 面向人显示的小数值与精度声明。 */
export interface DecimalDisplay {
  value: string;
  decimals: number;
  mode: 'round-half-up';
}

export interface QuoteArgs {
  reserveIn: bigint;
  reserveOut: bigint;
  amountIn: bigint;
  feeNumerator: bigint;
}

/**
 * 固定输入报价：
 *   q   = a * (D - f)
 *   b   = floor(q * y / (x * D + q))
 * 分子 num = q*y，分母 den = x*D+q；余数 rem = num - b*den。
 * 手续费只进入分子/分母，绝不先对手续费单独取整再套公式。
 */
export interface QuoteResult {
  q: string;
  numerator: string;
  denominator: string;
  amountOut: string;
  remainder: string;
  feeNumerator: string;
  feeDenominator: string;
}

export function quote({ reserveIn: x, reserveOut: y, amountIn: a, feeNumerator: f }: QuoteArgs): QuoteResult {
  const D = FEE_DENOMINATOR;
  if (x <= 0n || y <= 0n) throw new ApiError('INVALID_ARGUMENT', '储备必须为正整数');
  if (a <= 0n) throw new ApiError('ZERO_INPUT', '输入数量必须为正整数');
  if (f < 0n || f >= D) throw new ApiError('INVALID_ARGUMENT', `费率分子须满足 0 <= f < ${D}`);

  const q = a * (D - f);
  const numerator = q * y;
  const denominator = x * D + q;
  const amountOut = numerator / denominator;
  const remainder = numerator % denominator;

  if (amountOut <= 0n) {
    throw new ApiError('ZERO_OUTPUT', '报价结果为零：输出数量过小，已拒绝', {
      numerator: numerator.toString(),
      denominator: denominator.toString(),
    });
  }
  if (amountOut >= y) {
    throw new ApiError('ZERO_OUTPUT', '输出不得取走全部储备');
  }

  return {
    q: q.toString(),
    numerator: numerator.toString(),
    denominator: denominator.toString(),
    amountOut: amountOut.toString(),
    remainder: remainder.toString(),
    feeNumerator: f.toString(),
    feeDenominator: D.toString(),
  };
}

/** 应用一笔成交：输入储备加完整 a，输出储备减 b。返回新储备与成交前后乘积。 */
export interface AppliedSwap {
  reserveInNext: bigint;
  reserveOutNext: bigint;
  productBefore: string;
  productAfter: string;
}

export function applySwap(reserveIn: bigint, reserveOut: bigint, amountIn: bigint, amountOut: bigint): AppliedSwap {
  const productBefore = reserveIn * reserveOut;
  const reserveInNext = reserveIn + amountIn;
  const reserveOutNext = reserveOut - amountOut;
  if (reserveOutNext <= 0n) {
    throw new ApiError('ZERO_OUTPUT', '成交后输出储备必须保持为正');
  }
  const productAfter = reserveInNext * reserveOutNext;
  if (productAfter < productBefore) {
    throw new ApiError('VERIFY_FAILED', '乘积不变量被破坏：收费/向下取整后 x*y 不应下降', {
      productBefore: productBefore.toString(),
      productAfter: productAfter.toString(),
    });
  }
  return {
    reserveInNext,
    reserveOutNext,
    productBefore: productBefore.toString(),
    productAfter: productAfter.toString(),
  };
}

export function frac(numerator: bigint, denominator: bigint): Fraction {
  if (denominator <= 0n) throw new ApiError('INVALID_ARGUMENT', '分数分母必须为正');
  return { numerator: numerator.toString(), denominator: denominator.toString() };
}

/**
 * 精确分数的人类可读小数，四舍五入到 decimals 位。
 * 精度单独声明，绝不与精确分数混用。
 */
export function toDecimal(numerator: bigint, denominator: bigint, decimals: number): DecimalDisplay {
  if (denominator <= 0n) throw new ApiError('INVALID_ARGUMENT', '分数分母必须为正');
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 30) {
    throw new ApiError('INVALID_ARGUMENT', '小数精度必须在 0..30 之间');
  }
  const neg = numerator < 0n !== denominator < 0n;
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  const scale = 10n ** BigInt(decimals);
  const scaled = (n * scale * 10n) / d;
  let rounded = scaled / 10n;
  if (scaled % 10n >= 5n) rounded += 1n;
  const intPart = rounded / scale;
  const fracPart = (rounded % scale).toString().padStart(decimals, '0');
  const value = `${neg ? '-' : ''}${intPart.toString()}${decimals > 0 ? `.${fracPart}` : ''}`;
  return { value, decimals, mode: 'round-half-up' };

}

/** 解析并校验正整数十进制字符串，全程不经过 Number。 */
export function parsePositiveDecimal(raw: string, field: string, maxDigits: number): bigint {
  if (typeof raw !== 'string') {
    throw new ApiError('INVALID_ARGUMENT', `${field} 必须是十进制字符串`);
  }
  const s = raw.trim();
  if (!/^[0-9]+$/.test(s)) {
    throw new ApiError('INVALID_ARGUMENT', `${field} 必须是非负整数字符串（仅数字）`, { received: raw });
  }
  if (s.length > maxDigits) {
    throw new ApiError('LIMIT_EXCEEDED', `${field} 位数超过上限 ${maxDigits}`);
  }
  let v: bigint;
  try {
    v = BigInt(s);
  } catch {
    throw new ApiError('INVALID_ARGUMENT', `${field} 无法解析为整数`);
  }
  if (v <= 0n) throw new ApiError('INVALID_ARGUMENT', `${field} 必须为正整数`);
  return v;
}

/** 费率分子解析：允许 0，但必须小于 D。 */
export function parseFeeNumerator(raw: string | number, maxDigits: number): bigint {
  const s = String(raw).trim();
  if (!/^[0-9]+$/.test(s) || s.length > maxDigits) {
    throw new ApiError('INVALID_ARGUMENT', '费率分子必须是非负整数字符串', { received: raw });
  }
  const v = BigInt(s);
  if (v >= FEE_DENOMINATOR) {
    throw new ApiError('INVALID_ARGUMENT', `费率分子必须小于 ${FEE_DENOMINATOR}`);
  }
  return v;
}

export function assertDirection(raw: string): Direction {
  if (raw !== 'X_TO_Y' && raw !== 'Y_TO_X') {
    throw new ApiError('INVALID_DIRECTION', `非法资产方向: ${raw}（允许 X_TO_Y / Y_TO_X）`);
  }
  return raw;
}
