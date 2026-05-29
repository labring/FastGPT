const scalarApiReferenceCss = `
.sidebar-heading-link-method .sidebar-heading-type {
  min-width: 42px;
  height: 20px;
  justify-content: center;
  padding: 4px 8px;
  border: 0;
  border-radius: 999px;
  font-size: 10px;
  line-height: 1;
}

.sidebar-heading-type--get {
  color: #1D6FE8;
  background-color: #E8F1FF;
}

.sidebar-heading-type--post {
  color: #0F8B57;
  background-color: #E6F7EE;
}

.sidebar-heading-type--put,
.sidebar-heading-type--patch {
  color: #B86B00;
  background-color: #FFF1D8;
}

.sidebar-heading-type--delete {
  color: #C93D3D;
  background-color: #FDEAEA;
}

.sidebar-heading-type--options {
  color: #7A55D9;
  background-color: #F1ECFF;
}

.sidebar-heading-type--head,
.sidebar-heading-type--trace {
  color: #5B6678;
  background-color: #EEF1F5;
}

.dark-mode .sidebar-heading-type--get {
  color: #8BBEFF;
  background-color: rgba(58, 122, 210, 0.2);
}

.dark-mode .sidebar-heading-type--post {
  color: #72DBA2;
  background-color: rgba(28, 142, 86, 0.22);
}

.dark-mode .sidebar-heading-type--put,
.dark-mode .sidebar-heading-type--patch {
  color: #F0B96A;
  background-color: rgba(190, 115, 16, 0.22);
}

.dark-mode .sidebar-heading-type--delete {
  color: #F48A8A;
  background-color: rgba(190, 62, 62, 0.22);
}

.dark-mode .sidebar-heading-type--options {
  color: #B7A3FF;
  background-color: rgba(116, 86, 214, 0.24);
}

.dark-mode .sidebar-heading-type--head,
.dark-mode .sidebar-heading-type--trace {
  color: #B5BFCE;
  background-color: rgba(98, 111, 130, 0.24);
}

`;

export const getScalarOpenApiReferenceConfig = (url: string) =>
  ({
    customCss: scalarApiReferenceCss,
    hideDarkModeToggle: false,
    hideClientButton: true,
    showToolbar: 'never',
    theme: 'default',
    url
  }) as const;
