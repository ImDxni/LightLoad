
export function CustomLoadingScreen() {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 7,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#121216',
      }}
    >
      <div
        style={{
          position: 'relative',
          width: 104,
          height: 104,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <img
          src="/spark.svg"
          alt=""
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            width: 104,
            height: 104,
            transformOrigin: '50% 50%',
            animation: 'llspin 0.75s linear infinite',
          }}
        />
        <img src="/favicon.svg" width={52} height={52} alt="" aria-hidden="true" />
      </div>
    </div>
  )
}
