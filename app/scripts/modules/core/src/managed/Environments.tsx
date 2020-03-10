import React, { useState, useEffect } from 'react';
import {
  IManagedEnviromentSummary,
  IManagedResourceSummary,
  IManagedArtifactSummary,
  IManagedApplicationEnvironmentsSummary,
} from 'core/domain';
import { Application, ApplicationDataSource } from 'core/application';

const debug = false;

interface ISelectedArtifact {
  name: string;
  version: string;
}

interface IArtifactsListProps {
  artifacts: IManagedArtifactSummary[];
  artifactSelected: (artifact: ISelectedArtifact) => void;
  selectedArtifact: ISelectedArtifact;
}

function ArtifactsList({ artifacts, artifactSelected, selectedArtifact }: IArtifactsListProps) {
  return (
    <div>
      <h1>Artifax</h1>
      {artifacts.map(({ versions, name }) =>
        versions.map(({ version, environments }) => (
          <div key={version}>
            <pre
              onClick={() => {
                artifactSelected(
                  selectedArtifact?.name === name && selectedArtifact?.version === version ? null : { name, version },
                );
              }}
            >
              {`[${version}] ${name}\n`}
              {environments.map(env => env.name).join(', ')}
            </pre>
          </div>
        )),
      )}
      {debug && <pre>{JSON.stringify(artifacts, null, 4)}</pre>}
    </div>
  );
}

interface IEnvironmentsListProps {
  environments: IManagedEnviromentSummary[];
  resources: IManagedResourceSummary[];
  selectedArtifact: ISelectedArtifact;
}

function EnvironmentsList({ environments, resources, selectedArtifact }: IEnvironmentsListProps) {
  const resourcesMap = resources.reduce((map, r) => {
    map[r.id] = r;
    return map;
  }, {} as { [key: string]: IManagedResourceSummary });
  return (
    <div>
      <h1>EPA</h1>
      <pre>
        {selectedArtifact
          ? `Showing ${selectedArtifact.name} ${selectedArtifact.version}`
          : "Select an artifact to understand it's deployment journey."}
      </pre>
      {environments.map(({ name, resources }) => (
        <div key={name}>
          <h2>{name}</h2>
          <pre>
            {resources
              .map(resourceId => resourcesMap[resourceId])
              .map(
                ({ kind, artifact, moniker: { app, stack, detail } }) =>
                  ` [${kind}] ${[app, stack, detail].filter(Boolean).join('-')} ${artifact?.versions?.current ||
                    'unknown version'}`,
              )
              .join('\n')}
          </pre>
        </div>
      ))}
      {debug && <pre>{JSON.stringify(resourcesMap, null, 4)}</pre>}
    </div>
  );
}

interface IEnvironmentsProps {
  app: Application;
}

export default function Environments(props: IEnvironmentsProps) {
  const { app } = props;
  const dataSource: ApplicationDataSource<IManagedApplicationEnvironmentsSummary> = app.getDataSource('environments');
  const [selectedArtifact, setSelectedArtifact] = useState<ISelectedArtifact | undefined>();
  const [environments, setEnvironments] = useState(dataSource.data);
  useEffect(() => dataSource.onRefresh(null, () => setEnvironments(dataSource.data)), [app]);

  return (
    <div style={{ width: '100%' }}>
      <span>For there shall be no greater pursuit than that towards desired state.</span>
      <div style={{ display: 'flex' }}>
        <ArtifactsList
          {...environments}
          selectedArtifact={selectedArtifact}
          artifactSelected={artifact => {
            setSelectedArtifact(artifact);
          }}
        />
        <EnvironmentsList {...environments} selectedArtifact={selectedArtifact} />
      </div>
      {/* <pre>{JSON.stringify(environments, null, 4)}</pre> */}
    </div>
  );
}
