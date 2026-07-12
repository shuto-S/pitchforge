export function isDraftValueNeedsReview(value: string): boolean {
  return /^(?:要確認|確認が必要)[:：]/u.test(value.trimStart());
}
