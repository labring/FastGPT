interface Data {
  totalAmount: number;
  totalUsage: number;
  remaining: number;
  formattedDate: string;
  GPT4CheckResult: boolean;
  isSubscrible: boolean;
}
// https://github.com/ClarenceDan/openai-billing/blob/main/checkbilling.html
export async function checkBilling(apiKey: string): Promise<Data> {
  let apiUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';

  if (apiUrl.endsWith('/')) apiUrl = apiUrl.slice(0, -1);

  // 计算起始日期和结束日期,当前为 90 天，最大不超过100天
  const now = new Date();
  let startDate = new Date(+now - 90 * 24 * 60 * 60 * 1000);
  const endDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const subDate = new Date(now);
  subDate.setDate(1);

  // 设置API请求URL和请求头
  const headers = {
    Authorization: 'Bearer ' + apiKey,
    'Content-Type': 'application/json'
  };
  const gpt4Check = `${apiUrl}/models`;
  const urlSubscription = `${apiUrl}/dashboard/billing/subscription`;
  let urlUsage = `${apiUrl}/dashboard/billing/usage?start_date=${formatDate(
    startDate
  )}&end_date=${formatDate(endDate)}`;

  try {
    // 获取API限额
    let response = await fetch(urlSubscription, { headers });

    if (!response.ok) {
      throw new Error('APIKEY ERROR: 错误或账号被封，请登录 OpenAI 查看。');
    }

    let currentDate = new Date();
    const subscriptionData = await response.json();
    const totalAmount = subscriptionData.system_hard_limit_usd;
    const expiryDate = new Date(subscriptionData.access_until * 1000 + 8 * 60 * 60 * 1000);
    const formattedDate = `${expiryDate.getFullYear()}-${(expiryDate.getMonth() + 1)
      .toString()
      .padStart(2, '0')}-${expiryDate.getDate().toString().padStart(2, '0')}`;

    const gpt4CheckResponse = await fetch(gpt4Check, { headers });
    const gpt4CheckData = await gpt4CheckResponse.json();
    let GPT4CheckResult =
      Array.isArray(gpt4CheckData.data) &&
      gpt4CheckData.data.some((item: any) => item.id.includes('gpt-4'));

    let isSubscrible = subscriptionData.plan.id.includes('payg');

    if (totalAmount > 20) {
      startDate = subDate;
      urlUsage = `${apiUrl}/dashboard/billing/usage?start_date=${formatDate(
        startDate
      )}&end_date=${formatDate(endDate)}`;
      response = await fetch(urlUsage, { headers });
      const usageData = await response.json();
    }

    response = await fetch(urlUsage, { headers });
    const usageData = await response.json();
    const totalUsage = usageData.total_usage / 100;

    const remaining = subscriptionData.system_hard_limit_usd - totalUsage;

    return { totalAmount, totalUsage, remaining, formattedDate, GPT4CheckResult, isSubscrible };
  } catch (error: any) {
    throw new Error(error.message as string);
  }
}

function formatDate(date: any) {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');

  return `${year}-${month}-${day}`;
}
