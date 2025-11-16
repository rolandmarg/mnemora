export function isLambda(): boolean {
  return !!(
    process.env.AWS_LAMBDA_FUNCTION_NAME ??
    process.env.LAMBDA_TASK_ROOT ??
    process.env.AWS_EXECUTION_ENV
  );
}

export function getLambdaFunctionName(): string | undefined {
  return process.env.AWS_LAMBDA_FUNCTION_NAME;
}

export function getLambdaFunctionVersion(): string | undefined {
  return process.env.AWS_LAMBDA_FUNCTION_VERSION;
}

export function getLambdaRequestId(): string | undefined {
  return process.env.AWS_REQUEST_ID;
}

export function getXRayTraceId(): string | undefined {
  const traceId = process.env._X_AMZN_TRACE_ID;
  if (traceId) {
    const match = traceId.match(/Root=([^;]+)/);
    if (match) {
      return match[1];
    }
  }
  return undefined;
}

