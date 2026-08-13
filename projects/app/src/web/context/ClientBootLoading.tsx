const ClientBootLoading = () => (
  <div className="client-boot-loading" role="status" aria-label="Loading">
    <div className="client-boot-loading__spinner" />
    <style jsx>{`
      .client-boot-loading {
        position: fixed;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
        background: #fff;
        z-index: 1000;
      }

      .client-boot-loading__spinner {
        width: 32px;
        height: 32px;
        border: 4px solid #e8eaed;
        border-top-color: #3370ff;
        border-radius: 50%;
        animation: client-boot-spin 0.65s linear infinite;
      }

      @keyframes client-boot-spin {
        to {
          transform: rotate(360deg);
        }
      }
    `}</style>
  </div>
);

export default ClientBootLoading;
