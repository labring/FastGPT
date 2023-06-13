import { Card, Link, Space, Grid, Divider, Typography } from '@arco-design/web-react';
import { IconApps, IconUser, IconUserGroup } from 'tushan/icon';
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area
} from 'tushan/chart';
import dayjs from 'dayjs';

const authStorageKey = 'tushan:auth';

type UsersChartDataType = { count: number; date: string }[];

export const Dashboard: React.FC = React.memo(() => {
  const [userCount, setUserCount] = useState(0); //用户数量
  const [kbCount, setkbCount] = useState(0);
  const [modelCount, setmodelCount] = useState(0);
  const [usersData, setUsersData] = useState<UsersChartDataType>([]);

  useEffect(() => {
    const baseUrl = import.meta.env.VITE_PUBLIC_SERVER_URL;
    const { token } = JSON.parse(window.localStorage.getItem(authStorageKey) ?? '{}');
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    };

    const fetchCounts = async () => {
      const userResponse = await fetch(`${baseUrl}/users?_end=1`, {
        headers
      });
      const kbResponse = await fetch(`${baseUrl}/kbs?_end=1`, {
        headers
      });
      const modelResponse = await fetch(`${baseUrl}/models?_end=1`, {
        headers
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
    const fetchUserData = async () => {
      const userResponse: UsersChartDataType = await fetch(`${baseUrl}/users/data`, {
        headers
      }).then((res) => res.json());
      setUsersData(
        userResponse.map((item) => ({
          ...item,
          date: dayjs(item.date).format('MM/DD')
        }))
      );
    };

    fetchCounts();
    fetchUserData();
  }, []);

  return (
    <div>
      <div>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Card bordered={false}>
            <Typography.Title heading={5}>FastGpt Admin</Typography.Title>

            <Divider />

            <Grid.Row justify="center">
              <Grid.Col flex={1} style={{ paddingLeft: '1rem' }}>
                {/* 把 userCount 传递给 DataItem 组件 */}
                <DataItem icon={<IconUser />} title={'用户'} count={userCount} />
              </Grid.Col>

              <Divider type="vertical" style={{ height: 40 }} />

              <Grid.Col flex={1} style={{ paddingLeft: '1rem' }}>
                <DataItem icon={<IconUserGroup />} title={'知识库'} count={kbCount} />
              </Grid.Col>

              <Divider type="vertical" style={{ height: 40 }} />

              <Grid.Col flex={1} style={{ paddingLeft: '1rem' }}>
                <DataItem icon={<IconApps />} title={'AI模型'} count={modelCount} />
              </Grid.Col>
            </Grid.Row>

            <Divider />
            <UserChart data={usersData} />
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
          alignItems: 'center'
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

const UserChart = ({ data }: { data: UsersChartDataType }) => {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <AreaChart
        width={730}
        height={250}
        data={data}
        margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
      >
        <defs>
          <linearGradient id="colorUv" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#8884d8" stopOpacity={0.8} />
            <stop offset="95%" stopColor="#8884d8" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="colorPv" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#82ca9d" stopOpacity={0.8} />
            <stop offset="95%" stopColor="#82ca9d" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="date" />
        <YAxis />
        <CartesianGrid strokeDasharray="3 3" />
        <Tooltip />
        <Area
          type="monotone"
          dataKey="count"
          stroke="#82ca9d"
          fillOpacity={1}
          fill="url(#colorPv)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
};
