export const drawerScrollbarStyles = {
  overflowY: 'overlay' as any,
  '&::-webkit-scrollbar': {
    width: '6px',
    position: 'absolute'
  },
  '&::-webkit-scrollbar-track': {
    background: 'transparent'
  },
  '&::-webkit-scrollbar-thumb': {
    background: 'myGray.300',
    borderRadius: '3px'
  },
  '&::-webkit-scrollbar-thumb:hover': {
    background: 'myGray.400'
  },
  scrollbarWidth: 'thin',
  scrollbarColor: 'var(--chakra-colors-myGray-300) transparent'
};
