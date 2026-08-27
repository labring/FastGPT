'use client';
import type { ConfigFormType, ConfigStoreType } from '@/pageComponents/admin/config/type';
import { TeamModeEnum } from '@/pageComponents/admin/config/type';
import FirstTitle from '@/pageComponents/admin/settings/FirstTitle';
import FormItem from '@/pageComponents/admin/settings/FormItem';
import ImageInput from '@/pageComponents/admin/settings/ImageInput';
import SecondTitle from '@/pageComponents/admin/settings/SecondTitle';
import SettingPage from '@/pageComponents/admin/settings/SettingPage';
import Switch from '@/pageComponents/admin/settings/Switch';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { formatConfigStore2FormSchema, formatFormData2ConfigStore } from '@/web/admin/config/adapt';
import { getInitFormData, postUpdateConfig } from '@/web/admin/config/api';
import { Box, Divider, Input, Textarea } from '@chakra-ui/react';
import MySelect from '@fastgpt/web/components/common/MySelect';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';

interface titleType {
  mainTitle: string;
  subTitles: string[];
}

const UserSetting = () => {
  const [rawData, setRawData] = useState<ConfigFormType>();
  const { feConfigs } = useSystemStore();
  // app 侧暂无 License 系统，SSO 相关配置默认关闭（与开源版一致），后续接入 license 后替换
  const licenseSsoEnabled = false;
  const { setValue, reset, watch, register, handleSubmit, control } =
    useForm<ConfigFormType['loginSettings']>();

  const { loading: loadingConfig } = useRequest(getInitFormData, {
    onSuccess: (data: ConfigStoreType) => {
      const aggregatedConfigs: ConfigFormType = formatConfigStore2FormSchema(data);
      setRawData(aggregatedConfigs);
      reset(aggregatedConfigs.loginSettings);
    },
    errorToast: '获取配置出错',
    manual: false
  });

  const { loading: loadingSave, runAsync: saveConfig } = useRequest(postUpdateConfig, {
    manual: true,
    successToast: '保存成功',
    errorToast: '保存失败'
  });

  const onSubmit = handleSubmit((data) => {
    if (!rawData) {
      return;
    }
    saveConfig(
      formatFormData2ConfigStore({
        ...rawData,
        loginSettings: data
      })
    );
  });

  const isLoading = loadingConfig || loadingSave;
  const hasSSOURL = !!watch('sso.url') && licenseSsoEnabled;
  const teamMode = watch('teamMode');
  const teamModeOptions = useMemo(
    () => [
      { label: '多团队模式', value: TeamModeEnum.multi },
      { label: '单团队模式', value: TeamModeEnum.single },
      ...(hasSSOURL ? [{ label: '同步模式', value: TeamModeEnum.sync }] : [])
    ],
    [hasSSOURL]
  );
  const titles: Array<titleType> = useMemo(
    () => [
      {
        mainTitle: '通知 & 登录设置',
        subTitles: [
          '团队模式设置',
          ...(hasSSOURL ? ['自定义用户系统配置'] : []),
          '邮箱通知配置(注册、套餐通知)',
          '阿里云短信配置',
          '阿里云短信模板CODE（SMS_xxx）',
          ...(licenseSsoEnabled
            ? [
                '微信服务号登录',
                ...(feConfigs?.showWecomConfig ? ['企微登录'] : []),
                'GitHub 登录配置',
                'Google 登录配置',
                '微软登录配置',
                '快速登录（不推荐）'
              ]
            : [])
        ]
      }
    ],
    [feConfigs?.showWecomConfig, hasSSOURL, licenseSsoEnabled]
  );

  return (
    <SettingPage titles={titles} loading={isLoading} onSubmit={onSubmit}>
      <FirstTitle title="通知登录 & 设置" />
      <SecondTitle title="团队模式设置" description="![](/imgs/single-team-mode-intro.png)" />

      <FormItem>
        <MySelect<`${TeamModeEnum}`>
          value={teamMode}
          list={teamModeOptions}
          onChange={(val) => setValue('teamMode', val)}
        />
      </FormItem>

      {teamMode === TeamModeEnum.multi && (
        <FormItem
          title="账号注销"
          description="开启后，多团队模式下符合条件的用户可以提交账号注销申请。"
        >
          <Switch control={control} name="accountCancellation.enabled" />
        </FormItem>
      )}

      <Divider mt="4" />
      {!!watch('sso.url') && (
        <>
          <SecondTitle title="自定义用户系统配置" />
          <FormItem
            title="用户服务根地址(末尾不加/)"
            description="具体用法请看： [SSO & 外部成员同步](https://doc.fastgpt.io/guide/admin/sso)"
          >
            <Box>{watch('sso.url')}</Box>
          </FormItem>
          <FormItem title="SSO 登录按钮标题" description="配置 SSO 登录按钮的标题">
            <Input {...register('sso.title')} placeholder="SSO 登录按钮标题" />
          </FormItem>
          <FormItem title="SSO 登录按钮的图标" description="配置 SSO 登录按钮的图标">
            <ImageInput control={control} name="sso.icon" />
          </FormItem>
          <FormItem
            title="SSO 自动跳转"
            description="开启后，用户进入登录页面，将会自动触发 SSO 登录，无需手动点击。"
          >
            <Switch control={control} name="sso.autoLogin" />
          </FormItem>
        </>
      )}
      <Divider mt="4" />

      <SecondTitle title="邮箱通知配置(注册、套餐通知)" />
      <FormItem
        title="邮箱服务SMTP地址"
        description="不同厂商不一样\nQQ: smtp.qq.com\ngmail: smtp.gmail.com"
      >
        <Input {...register('email.smtp')} placeholder="邮箱服务SMTP地址" />
      </FormItem>
      <FormItem title="邮箱服务SMTP用户名" description="qq 邮箱为例，对应 qq 号">
        <Input {...register('email.user')} placeholder="邮箱服务SMTP用户名" />
      </FormItem>
      <FormItem title="邮箱 Password" description="SMTP 授权码">
        <Input {...register('email.pass')} placeholder="SMTP 授权码" />
      </FormItem>
      <FormItem
        title="邮箱服务SMTP端口"
        description="常用端口:\n465: SSL/TLS (secure: 开)\n587: STARTTLS (secure: 关)\n25: 明文 (不推荐)"
      >
        <Input
          {...register('email.port', { valueAsNumber: true })}
          type="number"
          placeholder="465"
        />
      </FormItem>
      <FormItem
        title="启用 SSL/TLS (Secure)"
        description="465端口通常开启，587端口通常关闭(使用STARTTLS)"
      >
        <Switch control={control} name="email.secure" />
      </FormItem>
      <FormItem title="是否开启邮箱注册" description="是否开启邮箱注册">
        <Switch control={control} name="email.register" />
      </FormItem>
      <Divider />
      <SecondTitle title="阿里云短信配置" />
      <FormItem
        title="ACCESSKEYID"
        description="阿里云短信参数\nhttps://dysms.console.aliyun.com/overview\n申请对应的签名和短信模板，提供：\nACCESSKEYID\nACCESSSECRET\n签名名称\n模板CODE，SM开头的"
      >
        <Input {...register('phone.SNED_PHONE_ACCESSKEYID')} placeholder="ACCESSKEYID" />
      </FormItem>
      <FormItem title="ACCESSSECRET" description="阿里云账号的secret key">
        <Input {...register('phone.SNED_PHONE_ACCESSSECRET')} placeholder="ACCESSSECRET" />
      </FormItem>
      <FormItem title="签名名称" description="短信签名">
        <Input {...register('phone.SNED_PHONE_SIGNNAME')} placeholder="签名名称" />
      </FormItem>

      <SecondTitle
        title="阿里云短信模板CODE（SMS_xxx）"
        // description="都分中文和英文模版，英文模版可以不配，会自动拿中文的"
      />
      <FormItem title="注册账号" description="填写后，将会开启手机号注册">
        <Input {...register('sms.REGISTER')} placeholder="注册账号" />
      </FormItem>
      {/*<FormItem
        title="注册账号(EN)"
        description="填写后，将会开启手机号注册，如果不填则取中文版的。"
      >
        <Input {...register('sms.REGISTER_EN')} placeholder="注册账号(英文)" />
      </FormItem>*/}
      <FormItem title="重置密码" description="填写后，将会开启手机号找回密码">
        <Input {...register('sms.RESET_PASSWORD')} placeholder="重置密码" />
      </FormItem>
      {/*<FormItem title="重置密码(EN)" description="填写后，将会开启手机号找回密码">
        <Input {...register('sms.RESET_PASSWORD_EN')} placeholder="重置密码(英文)" />
      </FormItem>*/}
      <FormItem title="绑定通知手机号" description="填写后，将会允许手机号绑定通知方式">
        <Input {...register('sms.BIND_NOTIFICATION')} placeholder="绑定通知手机号" />
      </FormItem>
      {/*<FormItem title="绑定通知手机号(EN)" description="填写后，将会允许手机号绑定通知方式">
        <Input {...register('sms.BIND_NOTIFICATION_EN')} placeholder="绑定通知手机号(英文)" />
      </FormItem>*/}
      <FormItem title="账号注销验证码" description="填写后，手机号账号可以使用短信验证码注销账号">
        <Input {...register('sms.ACCOUNT_CANCELLATION')} placeholder="账号注销验证码" />
      </FormItem>
      {/*<FormItem title="账号注销验证码(EN)">
        <Input {...register('sms.ACCOUNT_CANCELLATION_EN')} placeholder="账号注销验证码(英文)" />
      </FormItem>*/}
      <FormItem
        title="账号注销倒计时提醒"
        description="7 天和 1 天提醒共用。阿里云模板变量：${scheduledDeleteAt}、${days}。"
      >
        <Input
          {...register('sms.ACCOUNT_CANCELLATION_REMINDER')}
          placeholder="账号注销倒计时提醒"
        />
      </FormItem>
      {/*<FormItem
        title="账号注销倒计时提醒(EN)"
        description="7 天和 1 天提醒共用。阿里云模板变量：${scheduledDeleteAt}、${days}。"
      >
        <Input
          {...register('sms.ACCOUNT_CANCELLATION_REMINDER_EN')}
          placeholder="账号注销倒计时提醒(英文)"
        />
      </FormItem>*/}
      <FormItem title="账号注销当天提醒" description="注销当天 10:00 发送。">
        <Input {...register('sms.ACCOUNT_CANCELLATION_TODAY')} placeholder="账号注销当天提醒" />
      </FormItem>
      {/*<FormItem title="账号注销当天提醒(EN)" description="注销当天 10:00 发送。">
        <Input
          {...register('sms.ACCOUNT_CANCELLATION_TODAY_EN')}
          placeholder="账号注销当天提醒(英文)"
        />
      </FormItem>*/}
      <FormItem title="订阅套餐即将过期" description="填写后，套餐即将过期，会发送一个短信">
        <Input {...register('sms.EXPIRE_SOON')} placeholder="订阅套餐即将过期" />
      </FormItem>
      {/*<FormItem title="订阅套餐即将过期(EN)" description="填写后，套餐即将过期，会发送一个短信">
        <Input {...register('sms.EXPIRE_SOON_EN')} placeholder="订阅套餐即将过期(英文)" />
      </FormItem>*/}
      <FormItem title="免费版用户清理警告">
        <Input {...register('sms.FREE_CLEAN')} placeholder="免费版用户清理警告" />
      </FormItem>
      {/*<FormItem title="免费版用户清理警告(EN)">
        <Input {...register('sms.FREE_CLEAN_EN')} placeholder="免费版用户清理警告" />
      </FormItem>*/}
      <FormItem title="积分不足30%通知">
        <Input {...register('sms.POINTS_THIRTY_PERCENT_REMAIN')} placeholder="积分不足通知" />
      </FormItem>
      {/*<FormItem title="积分不足30%通知(EN)">
        <Input {...register('sms.POINTS_THIRTY_PERCENT_REMAIN_EN')} placeholder="积分不足通知" />
      </FormItem>*/}
      <FormItem title="积分不足10%通知">
        <Input {...register('sms.POINTS_TEN_PERCENT_REMAIN')} placeholder="积分不足通知" />
      </FormItem>
      {/*<FormItem title="积分不足10%通知(EN)">
        <Input {...register('sms.POINTS_TEN_PERCENT_REMAIN_EN')} placeholder="积分不足通知" />
      </FormItem>*/}
      <FormItem title="积分不足通知">
        <Input {...register('sms.LACK_OF_POINTS')} placeholder="积分不足通知" />
      </FormItem>
      {/*<FormItem title="积分不足通知(EN)">
        <Input {...register('sms.LACK_OF_POINTS_EN')} placeholder="积分不足通知" />
      </FormItem>*/}

      {licenseSsoEnabled && (
        <>
          <>
            <SecondTitle title="微信服务号登录" />
            <FormItem
              title="AppID"
              description="服务号的 Appid。微信服务号的验证地址填写：商业版域名/api/support/user/account/login/wx/callback"
            >
              <Input {...register('wechat.appID')} placeholder="AppID" />
            </FormItem>
            <FormItem title="AppSecret" description="服务号的 Secret">
              <Input {...register('wechat.appSecret')} placeholder="AppSecret" />
            </FormItem>
          </>

          {!!feConfigs?.showWecomConfig && (
            <>
              <SecondTitle title="企微登录" />
              <FormItem title="SuiteId" description="三方应用的 SuiteId">
                <Input {...register('wecom.suiteId')} placeholder="wwxxxxxxxxxxxxxxx" />
              </FormItem>
              <FormItem title="Secret" description="Secret">
                <Input {...register('wecom.secret')} placeholder="Secret" />
              </FormItem>
              <FormItem title="Token" description="Token">
                <Input {...register('wecom.token')} placeholder="Token" />
              </FormItem>
              <FormItem title="EncodingAESKey" description="EncodingAESKey">
                <Input {...register('wecom.encodingAESKey')} placeholder="EncodingAESKey" />
              </FormItem>
              <FormItem
                title="CorpId"
                description="服务商后台->工具->应用开发->通用配置->通用开发参数"
              >
                <Input {...register('wecom.cropId')} placeholder="CorpId" />
              </FormItem>
              <FormItem
                title="服务商的 Secret"
                description="服务商后台->工具->应用开发->通用配置->通用开发参数"
              >
                <Input {...register('wecom.providerSecret')} placeholder="providerSecret" />
              </FormItem>
              <FormItem
                title="收银台的 Secret"
                description="服务商后台->工具->收银台->收银台API调用密钥"
              >
                <Input {...register('wecom.paySecret')} placeholder="paySecret" />
              </FormItem>
              <FormItem
                title={'购买"接口调用许可(license)"的管理员 userid'}
                description="下单人。服务商企业内成员的明文userid。该userid必须登录过企业微信，并且企业微信已绑定微信，且必须为服务商企业内具有“购买接口许可”权限的管理员。最终也支持由其他人支付"
              >
                <Input {...register('wecom.buyerUserId')} placeholder="userid" />
              </FormItem>
              <FormItem title="基础版版本ID" description="基础版的版本ID（edition_id）">
                <Input {...register('wecom.basicVersionId')} placeholder="基础版版本ID" />
              </FormItem>
              <FormItem title="高级版版本ID" description="高级版的版本ID（edition_id）">
                <Input {...register('wecom.advancedVersionId')} placeholder="高级版版本ID" />
              </FormItem>
            </>
          )}

          <>
            <SecondTitle title="GitHub 登录配置" />
            <FormItem
              title="GitHub Client ID"
              description="https://github.com/settings/developers，注册一个 oauth，\nHomepage: 域名\nCallbackurl: 域名/login/provider\n提供：\nclientId: \nclientSecret:"
            >
              <Input {...register('github.clientId')} placeholder="GitHub Client ID" />
            </FormItem>
            <FormItem title="GitHub Secret">
              <Input {...register('github.secret')} placeholder="GitHub Secret" />
            </FormItem>
          </>
          <>
            <Divider />
            <SecondTitle title="Google 登录配置" />
            <FormItem title="Google Client ID">
              <Input {...register('google.clientId')} placeholder="Google Client ID" />
            </FormItem>
            <FormItem title="Google Secret">
              <Input {...register('google.secret')} placeholder="Google Secret" />
            </FormItem>
          </>
          <>
            <Divider />
            <SecondTitle title="微软登录配置" />
            <FormItem
              title="Microsoft Client ID"
              description="对应 Microsoft 应用的「应用程序(客户端) ID」"
            >
              <Input {...register('microsoft.clientId')} placeholder="Microsoft Client ID" />
            </FormItem>
            <FormItem title="Microsoft Client Secret">
              <Input {...register('microsoft.secret')} placeholder="Microsoft Client Secret" />
            </FormItem>
            <FormItem
              title="Microsoft Tenant ID"
              description="对应 Microsoft 应用的「租户 ID」, 若使用默认的 common 可不用填写"
            >
              <Input {...register('microsoft.tenantId')} placeholder="Microsoft Tenant ID" />
            </FormItem>
            <FormItem
              title="自定义按钮名"
              description="自定义按钮的名称，若不填写则使用默认的 Microsoft 按钮"
            >
              <Input {...register('microsoft.customButton')} placeholder="自定义按钮名" />
            </FormItem>
          </>
          <>
            <Divider />
            <SecondTitle title="快速登录（不推荐）" />
            <FormItem>
              <Textarea {...register('fastLogin')} placeholder="快速登录（不推荐）" />
            </FormItem>
          </>
        </>
      )}
    </SettingPage>
  );
};

export default UserSetting;
