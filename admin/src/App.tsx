import {
  createTextField,
  jsonServerProvider,
  ListTable,
  Resource,
  Tushan,
} from 'tushan';
import { authProvider } from './auth';
import { userFields,payFields,kbFields,ModelFields } from './fields';

const dataProvider = jsonServerProvider('http://localhost:3001');

function App() {
  return (
    <Tushan
      basename="/"
      header={'fastgpt-admin'}
      footer={'Build with stakeswky'}
      dataProvider={dataProvider}
      authProvider={authProvider}
    >
      <Resource
        name="users"
        label="用户信息"
        list={
          <ListTable
            filter={[
              createTextField('q', {
                label: 'Query',
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
    </Tushan>
  );
}

export default App;
