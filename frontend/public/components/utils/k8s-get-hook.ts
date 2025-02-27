import * as React from 'react';
import { k8sGet, K8sKind, K8sResourceCommon } from '../../module/k8s';
import { useActiveCluster } from '@console/shared/src/hooks/useActiveCluster'; // TODO remove multicluster

export const useK8sGet = <R extends K8sResourceCommon = K8sResourceCommon>(
  kind: K8sKind,
  name?: string,
  namespace?: string,
  opts?: { [k: string]: string },
): [R, boolean, any] => {
  const [cluster] = useActiveCluster(); // TODO remove multicluster
  const [data, setData] = React.useState<R>();
  const [loaded, setLoaded] = React.useState(false);
  const [loadError, setLoadError] = React.useState();
  React.useEffect(() => {
    const fetch = async () => {
      try {
        setLoadError(null);
        setLoaded(false);
        setData(null);
        const resource = await k8sGet(kind, name, namespace, { cluster, ...opts });
        setData(resource);
      } catch (error) {
        setLoadError(error);
      } finally {
        setLoaded(true);
      }
    };
    fetch();
  }, [cluster, kind, name, namespace, opts]);

  return [data, loaded, loadError];
};
