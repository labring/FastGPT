import {
  Card,
  Link,
  Space,
  Grid,
  Divider,
  Typography,
} from '@arco-design/web-react';
import { IconApps, IconUser, IconUserGroup } from 'tushan/icon';
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';



export const Dashboard: React.FC = React.memo(() => {

  const [userCount, setUserCount] = useState(0); //用户数量
  const [kbCount, setkbCount] = useState(0);
  const [modelCount, setmodelCount] = useState(0);
  useEffect(() => {
    const fetchCounts = async () => {
      const userResponse = await fetch('http://localhost:3001/users', {
        headers: { 'Content-Type': 'application/json' },
      });
      const kbResponse = await fetch('http://localhost:3001/kbs', {
        headers: { 'Content-Type': 'application/json' },
      });
      const modelResponse = await fetch('http://localhost:3001/models', {
        headers: { 'Content-Type': 'application/json' },
      });

      const userTotalCount = userResponse.headers.get('X-Total-Count');
      const kbTotalCount = kbResponse.headers.get('X-Total-Count');
      const modelTotalCount = modelResponse.headers.get('X-Total-Count');
      
      if (userTotalCount) {
        setUserCount(Number(userTotalCount));
      }
      if (kbTotalCount) {
        setkbCount(Number(kbTotalCount));
      }
      if (modelTotalCount) {
        setmodelCount(Number(modelTotalCount));
      }
    };

    fetchCounts();
  }, []);

  return (
    <div>
      <div>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Card bordered={false}>
            <Typography.Title heading={5}>
              {'你好，管理员'}
            </Typography.Title>

            <Divider />

            <Grid.Row justify="center">
              <Grid.Col flex={1} style={{ paddingLeft: '1rem' }}>
                {/* 把 userCount 传递给 DataItem 组件 */}
                <DataItem
                  icon={<IconUser />}
                  title={'用户'}
                  count={userCount}
                />
              </Grid.Col>

              <Divider type="vertical" style={{ height: 40 }} />

              <Grid.Col flex={1} style={{ paddingLeft: '1rem' }}>
                <DataItem
                  icon={<IconUserGroup />}
                  title={'知识库'}
                  count={kbCount}
                />
              </Grid.Col>

              <Divider type="vertical" style={{ height: 40 }} />

              <Grid.Col flex={1} style={{ paddingLeft: '1rem' }}>
                <DataItem
                  icon={<IconApps />}
                  title={'AI模型'}
                  count={modelCount}
                />
              </Grid.Col>
            </Grid.Row>

            <Divider />

            
          </Card>
        </Space>
      </div>
    </div>
  );
});
Dashboard.displayName = 'Dashboard';

const DashboardItem: React.FC<
  React.PropsWithChildren<{
    title: string;
    href?: string;
  }>
> = React.memo((props) => {
  const { t } = useTranslation();

  return (
    <Card
      title={props.title}
      extra={
        props.href && (
          <Link target="_blank" href={props.href}>
            {t('tushan.dashboard.more')}
          </Link>
        )
      }
      bordered={false}
      style={{ overflow: 'hidden' }}
    >
      {props.children}
    </Card>
  );
});
DashboardItem.displayName = 'DashboardItem';

const DataItem: React.FC<{
  icon: React.ReactElement;
  title: string;
  count: number;
}> = React.memo((props) => {
  return (
    <Space>
      <div
        style={{
          fontSize: 20,
          padding: '0.5rem',
          borderRadius: '9999px',
          border: '1px solid #ccc',
          width: 24,
          height: 24,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        {props.icon}
      </div>
      <div>
        <div style={{ fontWeight: 700 }}>{props.title}</div>
        <div>{props.count}</div>
      </div>
    </Space>
  );
});
DataItem.displayName = 'DataItem';
