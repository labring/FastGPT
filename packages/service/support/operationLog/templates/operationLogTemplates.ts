export const loginTemplate = ({
  name
}: {
  name: string;
}): {
  operationLog: string;
} => {
  return {
    operationLog: `${name} 登录了系统`
  };
};

export const createInvitationLinkTemplate = ({
  name,
  link
}: {
  name: string;
  link: string;
}): {
  operationLog: string;
} => {
  return {
    operationLog: `${name} 创建了邀请链接 ${link}`
  };
};

export const joinTeamTemplate = ({
  name,
  link
}: {
  name: string;
  link: string;
}): {
  operationLog: string;
} => {
  return {
    operationLog: `${name}通过邀请链接 ${link} 加入了团队`
  };
};

export const changeMemberNameTemplate = ({
  name,
  memberName,
  newName
}: {
  name: string;
  memberName: string;
  newName: string;
}): {
  operationLog: string;
} => {
  return {
    operationLog: `${name} 修改了成员 ${memberName} 的名称为 ${newName}`
  };
};

export const kickOutTeamTemplate = ({
  name,
  memberName
}: {
  name: string;
  memberName: string;
}): {
  operationLog: string;
} => {
  return {
    operationLog: `${name} 将成员 ${memberName} 移出了团队`
  };
};

export const createDepartmentTemplate = ({
  name,
  departmentName
}: {
  name: string;
  departmentName: string;
}): {
  operationLog: string;
} => {
  return {
    operationLog: `${name} 创建了子部门 ${departmentName}`
  };
};

export const changeDepartmentNameTemplate = ({
  name,
  departmentName
}: {
  name: string;
  departmentName: string;
}): {
  operationLog: string;
} => {
  return {
    operationLog: `${name} 编辑了子部门 ${departmentName} 的信息`
  };
};

export const deleteDepartmentTemplate = ({
  name,
  departmentName
}: {
  name: string;
  departmentName: string;
}): {
  operationLog: string;
} => {
  return {
    operationLog: `${name} 删除了子部门 ${departmentName}`
  };
};

export const relocateDepartmentTemplate = ({
  name,
  departmentName
}: {
  name: string;
  departmentName: string;
}): {
  operationLog: string;
} => {
  return {
    operationLog: `${name} 移动了子部门 ${departmentName}`
  };
};

export const createGroupTemplate = ({
  name,
  groupName
}: {
  name: string;
  groupName: string;
}): {
  operationLog: string;
} => {
  return {
    operationLog: `${name} 创建了群组 ${groupName}`
  };
};

export const deleteGroupTemplate = ({
  name,
  groupName
}: {
  name: string;
  groupName: string;
}): {
  operationLog: string;
} => {
  return {
    operationLog: `${name} 删除了群组 ${groupName}`
  };
};

export const assignPermissionTemplate = ({
  name,
  objectName,
  permission
}: {
  name: string;
  objectName: string;
  permission: string;
}): {
  operationLog: string;
} => {
  return {
    operationLog: `${name} 更改了 ${objectName} 的权限状态为 **${permission}** `
  };
};
