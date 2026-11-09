const ValidationError = ({ message }) => {
  if (!message) return null;

  return (
    <p className="mt-1 text-start text-sm text-red-500" role="alert">
      {message}
    </p>
  );
};

export default ValidationError;