declare module 'aws-xray-sdk-core' {
  export interface Segment {
    addNewSubsegment(name: string): Subsegment;
    addAnnotation(key: string, value: string | number | boolean): void;
    addMetadata(key: string, value: unknown): void;
  }

  export interface Subsegment {
    addMetadata(key: string, value: unknown): void;
    addError(error: Error): void;
    close(): void;
  }

  export function getSegment(): Segment | undefined;
}


