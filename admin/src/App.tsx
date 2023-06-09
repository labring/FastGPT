import {
  createTextField,
  jsonServerProvider,
  ListTable,
  Resource,
  Tushan,
} from 'tushan';
import { userFields,payFields,kbFields,ModelFields,SettingFields } from './fields';
import {Dashboard} from './Dashboard';
const dataProvider = jsonServerProvider('http://localhost:3001');

function App() {
  return (
    <Tushan
      basename="/"
      header={'FastAI后台管理系统'}
      footer={'Build with stakeswky'}
      dataProvider={dataProvider}
      dashboard={<Dashboard />}
    >
      <Resource
        name="users"
        label="用户信息"
        list={
          <ListTable
            filter={[
              createTextField('q', {
                label: 'Search',
              }),
            ]}
            fields={userFields}
            action={{ create: true, detail: true, edit: true, delete: true }}
          />
        }
      />

      <Resource
        name="pays"
        label="支付记录"
        list={
          <ListTable
            fields={payFields}
            action={{ detail: true }}
          />
        }
      />
      <Resource
        name="kbs"
        label="知识库"
        list={
          <ListTable
            fields={kbFields}
            action={{ detail: true }}
          />
        }
      />
      <Resource
        name="models"
        label="Ai模型"
        list={
          <ListTable
            fields={ModelFields}
            action={{ detail: true }}
          />
        }
      />
      <Resource
        name="settings"
        label="设置"
        list={
          <ListTable
            fields={SettingFields}
            action={{ detail: true , edit: true }}
          />
        }
      />
    </Tushan>
  );
}

export default App;
