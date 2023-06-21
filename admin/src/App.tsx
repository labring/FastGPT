import {
  createTextField,
  jsonServerProvider,
  ListTable,
  Resource,
  Tushan,
  fetchJSON,
  TushanContextProps,
  HTTPClient
} from 'tushan';
import { authProvider } from './auth';
import { userFields, payFields, kbFields, ModelFields, SystemFields } from './fields';
import { Dashboard } from './Dashboard';
import { IconUser, IconApps, IconBook, IconStamp } from 'tushan/icon';
import { i18nZhTranslation } from 'tushan/client/i18n/resources/zh';

const authStorageKey = 'tushan:auth';

const httpClient: HTTPClient = (url, options = {}) => {
  try {
    if (!options.headers) {
      options.headers = new Headers({ Accept: 'application/json' });
    }
    const { token } = JSON.parse(window.localStorage.getItem(authStorageKey) ?? '{}');
    (options.headers as Headers).set('Authorization', `Bearer ${token}`);

    return fetchJSON(url, options);
  } catch (err) {
    return Promise.reject();
  }
};

const dataProvider = jsonServerProvider(import.meta.env.VITE_PUBLIC_SERVER_URL, httpClient);

const i18n: TushanContextProps['i18n'] = {
  languages: [
    {
      key: 'zh',
      label: '简体中文',
      translation: i18nZhTranslation
    }
  ]
};

function App() {
  return (
    <Tushan
      basename="/"
      header={'FastGpt-Admin'}
      i18n={i18n}
      dataProvider={dataProvider}
      authProvider={authProvider}
      dashboard={<Dashboard />}
    >
      <Resource
        name="users"
        label="用户信息"
        icon={<IconUser />}
        list={
          <ListTable
            filter={[
              createTextField('username', {
                label: 'username'
              })
            ]}
            fields={userFields}
            action={{ detail: true, edit: true }}
          />
        }
      />
      <Resource
        name="models"
        icon={<IconApps />}
        label="应用"
        list={
          <ListTable
            filter={[
              createTextField('id', {
                label: 'id'
              }),
              createTextField('name', {
                label: 'name'
              })
            ]}
            fields={ModelFields}
            action={{ detail: true, edit: true }}
          />
        }
      />
      <Resource
        name="pays"
        label="支付记录"
        icon={<IconStamp />}
        list={
          <ListTable
            filter={[
              createTextField('userId', {
                label: 'userId'
              })
            ]}
            fields={payFields}
            action={{ detail: true }}
          />
        }
      />
      <Resource
        name="kbs"
        label="知识库"
        icon={<IconBook />}
        list={
          <ListTable
            filter={[
              createTextField('name', {
                label: 'name'
              }),
              createTextField('tag', {
                label: 'tag'
              })
            ]}
            fields={kbFields}
            action={{ detail: true }}
          />
        }
      />

      <Resource
        name="system"
        label="系统"
        list={
          <ListTable
            fields={SystemFields}
            action={{ detail: true, edit: true, create: true, delete: true }}
          />
        }
      />
    </Tushan>
  );
}

export default App;
