export function hasStrArrayChanged(str1: string[], str2: string[]) {
  return str1.length !== str2.length || str1.some((item, index) => item !== str2[index]);
}

export function makePayload(...pairs: [string, any][]) {
  const obj: Record<string, any> = {};
  pairs.forEach(([key, value]) => {
    if (value !== undefined) {
      obj[key] = value;
    }
  });
  return JSON.parse(JSON.stringify(obj));
}
