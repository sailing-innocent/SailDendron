import React, { useCallback, useState } from "react";

import {
  CalendarViewMessageType,
  ConfigUtils,
  DMessageSource,
  NoteProps,
  Time,
  VaultUtils,
} from "@dendronhq/common-all";
import {
  Badge,
  Button,
  CalendarProps as AntdCalendarProps,
  ConfigProvider,
  Divider,
} from "antd";
import _ from "lodash";
import { DendronProps } from "../types";
import { postVSCodeMessage } from "../utils/vscode";

type DateTime = InstanceType<typeof Time.DateTime>;
type CalendarProps = AntdCalendarProps<DateTime>;

function getMaybeDatePortion({ fname }: NoteProps, journalName: string) {
  const journalIndex = fname.indexOf(journalName);
  return fname.slice(journalIndex + journalName.length + 1);
}


export default function DendronCalendarPanel({}: DendronProps) {
  // -- init
  const ctx = "CalenderView";
  
  // logger
  // logger info

  const [activeMode, setActiveMode] = useState<CalendarProps["mode"]>("month");
  const defaultConfig = ConfigUtils.genDefaultConfig();
  const journalConfig = ConfigUtils.getJournal(defaultConfig);
  const journalDailyDomain = journalConfig.dailyDomain;
  const journalName = journalConfig.name;
  let journalDateFormat = journalConfig.dateFormat;
  const journalMonthDateFormat = "y.MM"; // TODO compute format for currentMode="year" from config

  const getDateKey = useCallback<
    (date: DateTime, mode?: CalendarProps["mode"]) => string | undefined
  >(
    (date, mode) => {
      const format =
        (mode || activeMode) === "month"
          ? journalDateFormat
          : journalMonthDateFormat;
      return format ? date.toFormat(format) : undefined;
    },
    [activeMode, journalDateFormat]
  );

  // const groupedDailyNotes = useMemo(() => {
  //   const vaultNotes = _.values(notes).filter((notes) => {
  //     if (currentVault) {
  //       return VaultUtils.isEqualV2(notes.vault, currentVault);
  //     }
  //     return true;
  //   });

  //   const dailyNotes = vaultNotes.filter((note) =>
  //     note.fname.startsWith(`${journalDailyDomain}.${journalName}`)
  //   );
  //   const result = _.groupBy(dailyNotes, (note) => {
  //     return journalName ? getMaybeDatePortion(note, journalName) : undefined;
  //   });
  //   return result;
  // }, [notes, journalName, journalDailyDomain, currentVault?.fsPath]);

  const onSelect = useCallback<
    (date: DateTime, mode?: CalendarProps["mode"]) => void
  >(
    (date, mode) => {
      const dateKey = getDateKey(date, mode);
      postVSCodeMessage({
        type: CalendarViewMessageType.onSelect,
        data: {
          id: undefined,
          fname: `${journalDailyDomain}.${journalName}.${dateKey}`,
        },
        source: DMessageSource.webClient,
      });
    },
    []
  );

  const onClickToday = useCallback(() => {
    const mode = "month";
    setActiveMode(mode);
    onSelect(Time.now(), mode);
  }, [onSelect]);

  return (
    <>
      <Divider plain style={{ marginTop: 0 }}>
        <Button type="primary" onClick={onClickToday}>
          Today
        </Button>
      </Divider>
      {/* <button onClick={onClickToday}>Today</button> */}
    </>
  )
}