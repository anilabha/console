/* eslint-disable @typescript-eslint/no-use-before-define */
import * as React from 'react';
import {
  Alert,
  AlertVariant,
  Bullseye,
  Button,
  Checkbox,
  EmptyState,
  EmptyStateBody,
  EmptyStateIcon,
  EmptyStateSecondaryActions,
  Progress,
  Spinner,
  Split,
  SplitItem,
  Stack,
  StackItem,
  Title,
} from '@patternfly/react-core';
import { ErrorCircleOIcon, InProgressIcon } from '@patternfly/react-icons';
import { useTranslation } from 'react-i18next';
import { history, resourcePath } from '@console/internal/components/utils';
import { useK8sWatchResource } from '@console/internal/components/utils/k8s-watch-hook';
import { PodModel } from '@console/internal/models';
import { PodKind } from '@console/internal/module/k8s';
import { killUploadPVC } from '../../../k8s/requests/cdi-upload/cdi-upload-requests';
import { getName, getNamespace } from '../../../selectors/selectors';
import { V1alpha1DataVolume } from '../../../types/api';
import { DataUpload } from '../cdi-upload-provider';
import { UPLOAD_STATUS } from '../consts';
import { getProgressVariant } from '../upload-pvc-popover';

// eslint-disable-next-line @typescript-eslint/naming-convention
export enum uploadErrorType {
  MISSING = 'missing',
  ALLOCATE = 'allocate',
  CERT = 'cert',
  CDI_INIT = 'cdi_init',
  PVC_SIZE = 'pvc_size',
}

export const UploadPVCFormStatus: React.FC<UploadPVCFormStatusProps> = ({
  upload,
  dataVolume,
  isSubmitting,
  isAllocating,
  allocateError,
  onErrorClick,
  onSuccessClick,
  onCancelClick,
}) => {
  const [error, setError] = React.useState(allocateError || upload?.uploadError?.message);

  React.useEffect(() => {
    const newError = allocateError || upload?.uploadError?.message;
    setError(newError);
  }, [allocateError, upload]);

  const onCancelFinish = () => {
    upload.cancelUpload();
    killUploadPVC(upload?.pvcName, upload?.namespace)
      .then(onCancelClick)
      .catch((err) => setError(err?.message));
  };

  return (
    <Bullseye className={!isSubmitting && 'kv--create-upload__hide'}>
      <EmptyState>
        <DataUploadStatus
          upload={upload}
          dataVolume={dataVolume}
          error={error}
          isAllocating={isAllocating}
          onErrorClick={onErrorClick}
          onSuccessClick={onSuccessClick}
          onCancelClick={onCancelFinish}
        />
      </EmptyState>
    </Bullseye>
  );
};

const DataUploadStatus: React.FC<DataUploadStatus> = ({
  upload,
  dataVolume,
  error,
  onErrorClick,
  isAllocating,
  onSuccessClick,
  onCancelClick,
}) => {
  if (error)
    return error === uploadErrorType.CDI_INIT ? (
      <CDIInitErrorStatus
        onErrorClick={onErrorClick}
        pvcName={getName(dataVolume)}
        namespace={getNamespace(dataVolume)}
      />
    ) : (
      <ErrorStatus error={error} onErrorClick={onErrorClick} />
    );
  if (isAllocating) return <AllocatingStatus />;
  if (upload?.uploadStatus === UPLOAD_STATUS.CANCELED) return <CancellingStatus />;
  return (
    <UploadingStatus
      upload={upload}
      onSuccessClick={onSuccessClick}
      onCancelClick={onCancelClick}
    />
  );
};

const AllocatingStatus: React.FC = () => {
  const { t } = useTranslation();
  return (
    <>
      <EmptyStateIcon icon={Spinner} />
      <Title headingLevel="h4" size="lg">
        {t('kubevirt-plugin~Allocating Resources')}
      </Title>
      <EmptyStateBody>
        {t(
          'kubevirt-plugin~Please wait, once the Data Volume has been created the data will start uploading into this Persistent Volume Claims.',
        )}
      </EmptyStateBody>
    </>
  );
};

const CancellingStatus: React.FC = () => {
  const { t } = useTranslation();
  return (
    <>
      <EmptyStateIcon icon={Spinner} />
      <Title headingLevel="h4" size="lg">
        {t('kubevirt-plugin~Cancelling Upload')}
      </Title>
      <EmptyStateBody>
        {' '}
        {t('kubevirt-plugin~Resources are being removed, please wait.')}
      </EmptyStateBody>
    </>
  );
};

const ErrorStatus: React.FC<ErrorStatusProps> = ({ error, onErrorClick }) => {
  const { t } = useTranslation();
  return (
    <>
      <EmptyStateIcon icon={ErrorCircleOIcon} color="#cf1010" />
      <Title headingLevel="h4" size="lg">
        {t('kubevirt-plugin~Error Uploading Data')}
      </Title>
      <EmptyStateBody>{error}</EmptyStateBody>
      <Button id="cdi-upload-error-btn" variant="primary" onClick={onErrorClick}>
        {error
          ? t('kubevirt-plugin~Back to Form')
          : t('kubevirt-plugin~View Persistent Volume Claim details')}
      </Button>
    </>
  );
};

const CDIInitErrorStatus: React.FC<CDIInitErrorStatus> = ({ onErrorClick, pvcName, namespace }) => {
  const { t } = useTranslation();
  const [shouldKillDv, setShouldKillDv] = React.useState(true);
  const [pod, podLoaded, podError] = useK8sWatchResource<PodKind>({
    kind: PodModel.kind,
    namespace,
    name: `cdi-upload-${pvcName}`,
  });

  return (
    <>
      <EmptyStateIcon icon={ErrorCircleOIcon} color="#cf1010" />
      <Title headingLevel="h4" size="lg">
        {t('kubevirt-plugin~CDI Error: Could not initiate Data Volume')}
      </Title>
      <EmptyStateBody>
        <Stack hasGutter>
          <StackItem>
            {t(
              'kubevirt-plugin~Data Volume failed to initiate upload, you can either delete the Data Volume and try again, or check logs',
            )}
          </StackItem>
          <StackItem>
            <Split>
              <SplitItem isFilled />
              <Checkbox
                id="approve-checkbox"
                isChecked={shouldKillDv}
                data-checked-state={shouldKillDv}
                aria-label="kill datavolume checkbox"
                label={t('kubevirt-plugin~Delete Data Volume: {{pvcName}}', { pvcName })}
                onChange={(v) => setShouldKillDv(v)}
              />
              <SplitItem isFilled />
            </Split>
          </StackItem>
        </Stack>
      </EmptyStateBody>
      <Button
        id="cdi-upload-error-btn"
        variant="primary"
        onClick={
          shouldKillDv
            ? () => {
                killUploadPVC(pvcName, namespace)
                  .then(() => {
                    onErrorClick();
                  })
                  .catch(() => {
                    onErrorClick();
                  });
              }
            : onErrorClick
        }
      >
        {shouldKillDv
          ? t('kubevirt-plugin~Back to Form (Deletes DV)')
          : t('kubevirt-plugin~Back to Form')}
      </Button>
      {podLoaded && !podError && pod && (
        <EmptyStateSecondaryActions>
          <Button
            id="cdi-upload-check-logs"
            onClick={() =>
              history.push(`${resourcePath(PodModel.kind, pod?.metadata?.name, namespace)}/logs`)
            }
            variant="link"
          >
            {t('kubevirt-plugin~Check Logs')}
          </Button>
        </EmptyStateSecondaryActions>
      )}
    </>
  );
};

const UploadingStatus: React.FC<UploadingStatusProps> = ({
  upload,
  onSuccessClick,
  onCancelClick,
}) => {
  const { t } = useTranslation();
  return (
    <>
      <EmptyStateIcon icon={InProgressIcon} />
      <Title headingLevel="h4" size="lg">
        {t('kubevirt-plugin~Uploading data to Persistent Volume Claim')}
      </Title>
      <EmptyStateBody>
        <Stack hasGutter>
          {upload?.uploadStatus === UPLOAD_STATUS.UPLOADING && (
            <StackItem>
              <Alert
                className="kv--create-upload__alert"
                isInline
                variant={AlertVariant.warning}
                title={t('kubevirt-plugin~Please don’t close this browser tab')}
              >
                {t(
                  'kubevirt-plugin~Closing it will cause the upload to fail. You may still navigate the console.',
                )}
              </Alert>
            </StackItem>
          )}
          <StackItem>
            {t(
              'kubevirt-plugin~Persistent Volume Claim has been created and your data source is now being uploaded to it. Once the uploading is completed the Persistent Volume Claim will become available',
            )}
          </StackItem>
          <StackItem>
            <Progress value={upload?.progress} variant={getProgressVariant(upload?.uploadStatus)} />
          </StackItem>
        </Stack>
      </EmptyStateBody>
      {onSuccessClick && (
        <Button id="cdi-upload-primary-pvc" variant="primary" onClick={onSuccessClick}>
          {t('kubevirt-plugin~View Persistent Volume Claim details')}
        </Button>
      )}
      {onCancelClick && upload?.uploadStatus === UPLOAD_STATUS.UPLOADING && (
        <EmptyStateSecondaryActions>
          <Button id="cdi-upload-cancel-btn" onClick={onCancelClick} variant="link">
            {t('kubevirt-plugin~Cancel Upload')}
          </Button>
        </EmptyStateSecondaryActions>
      )}
    </>
  );
};

type UploadingStatusProps = {
  upload: DataUpload;
  dataVolume?: V1alpha1DataVolume;
  onSuccessClick?: () => void;
  onCancelClick?: () => void;
};

export type UploadPVCFormStatusProps = UploadingStatusProps & {
  isSubmitting: boolean;
  isAllocating: boolean;
  allocateError: any;
  onErrorClick: () => void;
};

type ErrorStatusProps = {
  error: any;
  onErrorClick: () => void;
};

type CDIInitErrorStatus = {
  onErrorClick: () => void;
  pvcName: string;
  namespace: string;
};

export type DataUploadStatus = UploadingStatusProps &
  ErrorStatusProps & {
    isAllocating: boolean;
  };
