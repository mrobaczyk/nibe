# Parametry API NIBE (myUplink)

Wygenerowane ze skanu "NIBE Parameter Scan" (run #19). Kolumna "Klucz w aplikacji": pobierany co 5 min w `fetch_nibe.py`; "(wyłączony)" = zakomentowany w `PARAMS_MAP`. Opisy pochodzą z obserwacji skanów, nie z dokumentacji NIBE.

| ID | Nazwa API | Przykładowa wartość | Klucz w aplikacji | Uwagi |
|---|---|---|---|---|
| 30200 | heat pump | 1.0 (EB101) |  |  |
| 32473 | EL Energy produced for heating, cur | 1.19 kWh |  |  |
| 32474 | EL Energy produced for hot water, c | 0.0 kWh |  |  |
| 32475 | EL Energy produced for cooling, cur | 0.0 kWh |  |  |
| 32476 | EL Energy produced for pool, curren | 0.0 kWh |  |  |
| 32477 | EL Energy used for heating, current | 0.24 kWh |  |  |
| 32478 | EL Energy used for hot water, curre | 0.0 kWh |  |  |
| 32479 | EL Energy used for cooling, current | 0.0 kWh |  |  |
| 32480 | EL Energy used for pool, current ho | 0.0 kWh |  |  |
| 32481 | EL Energy used by additional heater | 0.0 kWh |  |  |
| 32482 | EL Energy used by additional heater | 0.0 kWh |  |  |
| 32483 | EL Energy used by additional heater | 0.0 kWh |  |  |
| 32486 | EL Current power consumption | 0.59 kW |  |  |
| 32491 | EL Energy produced for heating, pas | 2.92 kWh |  |  |
| 32492 | EL Energy produced for hot water, p | 0.0 kWh |  |  |
| 32493 | EL Energy produced for cooling, pas | 0.0 kWh |  |  |
| 32494 | EL Energy produced for pool, past h | 0.0 kWh |  |  |
| 32495 | EL Energy used for heating, past ho | 0.58 kWh |  |  |
| 32496 | EL Energy used for hot water, past | 0.0 kWh |  |  |
| 32497 | EL Energy used for cooling, past ho | 0.0 kWh |  |  |
| 32498 | EL Energy used for pool, past hour | 0.0 kWh |  |  |
| 32499 | EL Energy used by additional heater | 0.0 kWh |  |  |
| 32500 | EL Energy used by additional heater | 0.0 kWh |  |  |
| 32501 | EL Energy used by additional heater | 0.0 kWh |  |  |
| 32506 | EL Current consumption components E | 0.02 kW |  |  |
| 40004 | Outdoor temperature | 10.8 °C | outdoor |  |
| 40008 | Supply line (BT2) | 28.5 °C | supply_line |  |
| 40012 | Return line (BT3) | 24.5 °C | return_line |  |
| 40013 | Hot water top (BT7) | 42.7 °C | cwu_upper |  |
| 40014 | Hot water charging (BT6) | 34.2 °C | cwu_load |  |
| 40033 | Room temperature (BT50) | 23.1 °C | room |  |
| 40067 | Average outdoor temp (BT1) | 9.2 °C | out_avg |  |
| 40071 | External supply line (BT25) | 24.9 °C | bt25_temp |  |
| 40072 | Flow sensor (BF1) | 9.8 l/m | flow_sensor (wyłączony) |  |
| 40079 | Current (BE3) | 0.1 A | current_3 (wyłączony) |  |
| 40081 | Current (BE2) | 0.1 A | current_2 (wyłączony) |  |
| 40083 | Current (BE1) | 0.1 A | current_1 (wyłączony) |  |
| 40121 | Add. heat (BT63) | 28.5 °C | add_heat_temp (wyłączony) |  |
| 40146 | Oil temperature (BT29) | 0.0 °C | oil_temp (wyłączony) |  |
| 40782 | Requested compressor freq (EB101) | 25.0 Hz | req_compressor_freq (wyłączony) |  |
| 40940 | current value | -181.0 DM | degree_minutes_curr_value (wyłączony) |  |
| 40941 | Degree minutes | -180.0 | dm |  |
| 41162 | Low pressure (EB101-BP8) | 0.0 °C |  |  |
| 43001 | Version | 9727.0 |  |  |
| 43009 | Calculated supply climate system 1 | 24.0 °C | calc_flow |  |
| 43081 | Time factor add heat | 1.3 | time_factor_add_heat (wyłączony) |  |
| 43084 | Power internal add. heat | 0.0 kW |  |  |
| 43113 | Allow add. heat | 486.0 |  |  |
| 43115 | Hot water: charge set point value | -32768.0 °C |  | Hot water: charge set point: wartość tylko podczas ładowania CWU (stop temp. + 2 °C); poza tym -32768 |
| 43161 | Extern. adjustment climate system | 0.0 | external_adjustment (wyłączony) |  |
| 43239 | - of which hot water: | 1.0 hrs | external_adjustment_hot_water (wyłączony) |  |
| 43389 | Status, temp lux mode | 0.0 |  | Status temp lux mode: 1 gdy aktywny luksus (stały lub tymczasowy) |
| 43481 | Position QN10 | 0.0 |  |  |
| 44014 | Version (EB101) | 44.0 |  |  |
| 44032 | Slave (EB101) | 21.0 |  |  |
| 44033 | Compressor size (EB101) | 8.0 |  |  |
| 44055 | Return line (EB101-BT3) | 25.3 °C | return_line_eb101 |  |
| 44058 | Supply line (EB101-BT12) | 29.0 °C | supply_line_eb101 |  |
| 44059 | Discharge (EB101-BT14) | 52.1 °C | hot_gas |  |
| 44060 | Liquid line (EB101-BT15) | 24.4 °C | liquid_line |  |
| 44061 | Suction gas (EB101-BT17) | 12.2 °C | suction_gas |  |
| 44063 | EB101-BP8 | 0.0 °C |  |  |
| 44064 | Status compressor (EB101) | 60.0 | compressor_status (wyłączony) |  |
| 44069 | number of starts: | 1816.0 | starts |  |
| 44071 | total operating time: | 1779.0 hrs | op_time_total |  |
| 44073 | - of which hot water: | 303.0 hrs | op_time_cwu |  |
| 44075 | Alarms (EB101-EP14) | 0.0 |  |  |
| 44137 | Alarms (EB100-EP14) | 0.0 |  |  |
| 44259 | Next periodic increase | -732703.0 |  |  |
| 44262 | Blocked compressors | 262138.0 |  |  |
| 44282 | Active compressors, hot water | 0.0 |  |  |
| 44283 | Active compressors, heating | 1.0 |  |  |
| 44298 | Hot water, including int. add. hea | 1741.4 kWh | kwh_p_cwu |  |
| 44300 | Heating, including int. add. heat | 6322.7 kWh | kwh_p_heat |  |
| 44306 | Hot water, compressor only | 1724.5 kWh | kwh_p_cwu_compressor (wyłączony) |  |
| 44308 | Heating, compressor only | 6322.7 kWh | kwh_p_heat_compressor (wyłączony) |  |
| 44331 | R-version | 4.0 |  |  |
| 44362 | Outd temperature (EB101-BT28) | 9.6 °C | outdoor_eb101 (wyłączony) |  |
| 44363 | Evaporator (EB101-BT16) | 3.0 °C | evap |  |
| 44396 | Heating medium pump speed (GP1) | 36.0 % | pump_speed |  |
| 44487 | Docked compressors, cooling | 0.0 |  |  |
| 44689 | Defrosting (EB101-EP15) | 0.0 |  |  |
| 44699 | High pressure sensor (EB101-BP4) | 17.1 bar | high_pressure |  |
| 44700 | Low pressure (EB101-BP8) | 7.9 bar | low_pressure |  |
| 44701 | Current compressor frequency (EB1 | 25.0 Hz | compressor_hz |  |
| 44702 | Prot. mode, compressor (EB101) | 0.0 | protection_mode_compressor (wyłączony) |  |
| 44703 | Defrosting (EB101-EP14) | 0.0 | defrosting |  |
| 44775 | Requested compressor freq (EB101) | 25.0 Hz |  |  |
| 44979 | Fan speed (Step) | 3.0 |  |  |
| 45001 | Alarms | 0.0 |  |  |
| 47007 | heating curve | 2.0 | heat_curve |  |
| 47011 | Offset | 1.0 | heat_offset |  |
| 47015 | climate system | 19.0 °C | climate_system (wyłączony) |  |
| 47020 | flow line temp. at 30 °C | 15.0 °C |  |  |
| 47021 | flow line temp. at 20 °C | 15.0 °C |  |  |
| 47022 | flow line temp. at 10 °C | 26.0 °C |  |  |
| 47023 | flow line temp. at 0 °C | 32.0 °C |  |  |
| 47024 | flow line temp. at -10 °C | 35.0 °C |  |  |
| 47025 | flow line temp. at -20 °C | 40.0 °C |  |  |
| 47026 | flow line temp. at -30 °C | 45.0 °C |  |  |
| 47027 | outdoor temp. point | 0.0 °C |  |  |
| 47028 | change in curve | 0.0 °C |  |  |
| 47032 | climate system | 0.0 |  |  |
| 47041 | Hot water demand | 1.0 | hot_water_demand (wyłączony) | Hot water demand = tryb CWU wybrany przez użytkownika (1=Normalny, 2=Luksusowy; 0=Oszczędny niepotwierdzone). Harmonogram może go nadpisać |
| 47043 | start temp. lux | 42.0 °C |  | Start temp. lux |
| 47044 | start temp. normal | 40.0 °C |  | Start temp. normal |
| 47045 | start temp. economy | 15.0 °C |  | Start temp. economy |
| 47046 | stop temp. per. increase | 55.0 °C |  | Stop temp. per. increase |
| 47047 | stop temp. lux | 48.0 °C |  | Stop temp. lux |
| 47048 | stop temp. normal | 44.0 °C |  | Stop temp. normal |
| 47049 | stop temp. economy | 36.0 °C |  | Stop temp. economy |
| 47050 | activated | 1.0 | activated (wyłączony) |  |
| 47051 | period | 31.0 days | period (wyłączony) |  |
| 47137 | op. mode | 0.0 | op_mode (wyłączony) |  |
| 47206 | start compressor | -180.0 DM | config_history (start_gm_level) | Start GM level (config_history) |
| 47209 | diff. between additional steps | 100.0 DM | diff_steps (wyłączony) |  |
| 47212 | set max electrical add. | 900.0 | max_electrical_add (wyłączony) |  |
| 47266 | speed 4 | 90.0 % |  |  |
| 47267 | speed 3 | 70.0 % |  |  |
| 47268 | speed 2 | 25.0 % |  |  |
| 47269 | speed 1 | 0.0 % |  |  |
| 47270 | normal | 60.0 % |  |  |
| 47275 | months btwn filter alarms | 3.0 |  |  |
| 47276 | activated | 0.0 |  |  |
| 47277 | length of period 7 | 2.0 days |  |  |
| 47278 | length of period 6 | 2.0 days |  |  |
| 47279 | length of period 5 | 2.0 days |  |  |
| 47280 | length of period 4 | 3.0 days |  |  |
| 47281 | length of period 3 | 2.0 days |  |  |
| 47282 | length of period 2 | 2.0 days |  |  |
| 47283 | length of period 1 | 2.0 days |  |  |
| 47284 | temp. period 7 | 20.0 °C |  |  |
| 47285 | temp. period 6 | 30.0 °C |  |  |
| 47286 | temp. period 5 | 40.0 °C |  |  |
| 47287 | temp. period 4 | 45.0 °C |  |  |
| 47288 | temp. period 3 | 40.0 °C |  |  |
| 47289 | temp. period 2 | 30.0 °C |  |  |
| 47290 | temp. period 1 | 20.0 °C |  |  |
| 47347 | max. tank temperature | 95.0 °C |  |  |
| 47348 | max. solar collector temp. | 125.0 °C |  |  |
| 47375 | stop heating | 15.0 °C | stop_heating (wyłączony) |  |
| 47376 | stop additional heat | 5.0 °C | stop_additional_heat (wyłączony) |  |
| 47377 | filtering time | 24.0 hrs | config_history (filter_time) | Filter time (config_history) |
| 47378 | max diff compressor | 15.0 °C |  |  |
| 47379 | max diff addition | 7.0 °C |  |  |
| 47388 | decrease room temp | 0.0 |  |  |
| 47389 | deactivate hot water | 1.0 |  |  |
| 47394 | control room sensor syst | 0.0 |  |  |
| 47526 | More hot water | 0.0 |  | More hot water: != 0 przy tymczasowym luksusie (jednostka nieznana) |
| 47544 | start delta-T | 8.0 °C |  |  |
| 47545 | stop delta-T | 4.0 °C |  |  |
| 47550 | solar panel cooling | 0.0 |  |  |
| 47635 | activated | 1.0 |  | Harmonogram CWU 2: aktywny |
| 47637 | Start Sunday | 26100.0 |  | Harmonogram CWU 2: start (s od północy) |
| 47638 | Start Saturday | 26100.0 |  | Harmonogram CWU 2: start (s od północy) |
| 47639 | Start Friday | 26100.0 |  | Harmonogram CWU 2: start (s od północy) |
| 47640 | Start Thursday | 26100.0 |  | Harmonogram CWU 2: start (s od północy) |
| 47641 | Start Wednesday | 26100.0 |  | Harmonogram CWU 2: start (s od północy) |
| 47642 | Start Tuesday | 26100.0 |  | Harmonogram CWU 2: start (s od północy) |
| 47643 | Start Monday | 26100.0 |  | Harmonogram CWU 2: start (s od północy) |
| 47645 | Finish Sunday | 57600.0 |  | Harmonogram CWU 2: koniec (s od północy) |
| 47646 | Finish Saturday | 57600.0 |  | Harmonogram CWU 2: koniec (s od północy) |
| 47647 | Finish Friday | 57600.0 |  | Harmonogram CWU 2: koniec (s od północy) |
| 47648 | Finish Thursday | 57600.0 |  | Harmonogram CWU 2: koniec (s od północy) |
| 47649 | Finish Wednesday | 57600.0 |  | Harmonogram CWU 2: koniec (s od północy) |
| 47650 | Finish Tuesday | 57600.0 |  | Harmonogram CWU 2: koniec (s od północy) |
| 47651 | Finish Monday | 57600.0 |  | Harmonogram CWU 2: koniec (s od północy) |
| 47653 | Comfort mode Sunday | 0.0 |  | Harmonogram CWU 2: comfort mode 0=oszczędny 1=normalny 2=luksusowy -1=wyłączony |
| 47654 | Comfort mode Saturday | 0.0 |  | Harmonogram CWU 2: comfort mode 0=oszczędny 1=normalny 2=luksusowy -1=wyłączony |
| 47655 | Comfort mode Friday | 0.0 |  | Harmonogram CWU 2: comfort mode 0=oszczędny 1=normalny 2=luksusowy -1=wyłączony |
| 47656 | Comfort mode Thursday | 0.0 |  | Harmonogram CWU 2: comfort mode 0=oszczędny 1=normalny 2=luksusowy -1=wyłączony |
| 47657 | Comfort mode Wednesday | 0.0 |  | Harmonogram CWU 2: comfort mode 0=oszczędny 1=normalny 2=luksusowy -1=wyłączony |
| 47658 | Comfort mode Tuesday | 0.0 |  | Harmonogram CWU 2: comfort mode 0=oszczędny 1=normalny 2=luksusowy -1=wyłączony |
| 47659 | Comfort mode Monday | 0.0 |  | Harmonogram CWU 2: comfort mode 0=oszczędny 1=normalny 2=luksusowy -1=wyłączony |
| 47669 | activated | 1.0 |  | Harmonogram CWU 1: aktywny |
| 47671 | Start Sunday | 62100.0 |  | Harmonogram CWU 1: start (s od północy) |
| 47672 | Start Saturday | 62100.0 |  | Harmonogram CWU 1: start (s od północy) |
| 47673 | Start Friday | 62100.0 |  | Harmonogram CWU 1: start (s od północy) |
| 47674 | Start Thursday | 62100.0 |  | Harmonogram CWU 1: start (s od północy) |
| 47675 | Start Wednesday | 62100.0 |  | Harmonogram CWU 1: start (s od północy) |
| 47676 | Start Tuesday | 62100.0 |  | Harmonogram CWU 1: start (s od północy) |
| 47677 | Start Monday | 62100.0 |  | Harmonogram CWU 1: start (s od północy) |
| 47679 | Finish Sunday | 21600.0 |  | Harmonogram CWU 1: koniec (s od północy) |
| 47680 | Finish Saturday | 21600.0 |  | Harmonogram CWU 1: koniec (s od północy) |
| 47681 | Finish Friday | 21600.0 |  | Harmonogram CWU 1: koniec (s od północy) |
| 47682 | Finish Thursday | 21600.0 |  | Harmonogram CWU 1: koniec (s od północy) |
| 47683 | Finish Wednesday | 21600.0 |  | Harmonogram CWU 1: koniec (s od północy) |
| 47684 | Finish Tuesday | 21600.0 |  | Harmonogram CWU 1: koniec (s od północy) |
| 47685 | Finish Monday | 21600.0 |  | Harmonogram CWU 1: koniec (s od północy) |
| 47687 | Comfort mode Sunday | 0.0 |  | Harmonogram CWU 1: comfort mode 0=oszczędny 1=normalny 2=luksusowy -1=wyłączony |
| 47688 | Comfort mode Saturday | 0.0 |  | Harmonogram CWU 1: comfort mode 0=oszczędny 1=normalny 2=luksusowy -1=wyłączony |
| 47689 | Comfort mode Friday | 0.0 |  | Harmonogram CWU 1: comfort mode 0=oszczędny 1=normalny 2=luksusowy -1=wyłączony |
| 47690 | Comfort mode Thursday | 0.0 |  | Harmonogram CWU 1: comfort mode 0=oszczędny 1=normalny 2=luksusowy -1=wyłączony |
| 47691 | Comfort mode Wednesday | 0.0 |  | Harmonogram CWU 1: comfort mode 0=oszczędny 1=normalny 2=luksusowy -1=wyłączony |
| 47692 | Comfort mode Tuesday | 0.0 |  | Harmonogram CWU 1: comfort mode 0=oszczędny 1=normalny 2=luksusowy -1=wyłączony |
| 47693 | Comfort mode Monday | 0.0 |  | Harmonogram CWU 1: comfort mode 0=oszczędny 1=normalny 2=luksusowy -1=wyłączony |
| 47703 | activated | 0.0 |  |  |
| 47705 | Start Sunday | 0.0 |  |  |
| 47706 | Start Saturday | 0.0 |  |  |
| 47707 | Start Friday | 0.0 |  |  |
| 47708 | Start Thursday | 0.0 |  |  |
| 47709 | Start Wednesday | 0.0 |  |  |
| 47710 | Start Tuesday | 0.0 |  |  |
| 47711 | Start Monday | 0.0 |  |  |
| 47713 | Finish Sunday | 0.0 |  |  |
| 47714 | Finish Saturday | 0.0 |  |  |
| 47715 | Finish Friday | 0.0 |  |  |
| 47716 | Finish Thursday | 0.0 |  |  |
| 47717 | Finish Wednesday | 0.0 |  |  |
| 47718 | Finish Tuesday | 0.0 |  |  |
| 47719 | Finish Monday | 0.0 |  |  |
| 47721 | Fan mode Sunday | 1.0 |  |  |
| 47722 | Fan mode Saturday | 1.0 |  |  |
| 47723 | Fan mode Friday | 1.0 |  |  |
| 47724 | Fan mode Thursday | 1.0 |  |  |
| 47725 | Fan mode Wednesday | 1.0 |  |  |
| 47726 | Fan mode Tuesday | 1.0 |  |  |
| 47727 | Fan mode Monday | 1.0 |  |  |
| 47737 | activated | 0.0 |  |  |
| 47739 | Start Sunday | 0.0 |  |  |
| 47740 | Start Saturday | 0.0 |  |  |
| 47741 | Start Friday | 0.0 |  |  |
| 47742 | Start Thursday | 0.0 |  |  |
| 47743 | Start Wednesday | 0.0 |  |  |
| 47744 | Start Tuesday | 0.0 |  |  |
| 47745 | Start Monday | 0.0 |  |  |
| 47747 | Finish Sunday | 0.0 |  |  |
| 47748 | Finish Saturday | 0.0 |  |  |
| 47749 | Finish Friday | 0.0 |  |  |
| 47750 | Finish Thursday | 0.0 |  |  |
| 47751 | Finish Wednesday | 0.0 |  |  |
| 47752 | Finish Tuesday | 0.0 |  |  |
| 47753 | Finish Monday | 0.0 |  |  |
| 47755 | Fan mode Sunday | 1.0 |  |  |
| 47756 | Fan mode Saturday | 1.0 |  |  |
| 47757 | Fan mode Friday | 1.0 |  |  |
| 47758 | Fan mode Thursday | 1.0 |  |  |
| 47759 | Fan mode Wednesday | 1.0 |  |  |
| 47760 | Fan mode Tuesday | 1.0 |  |  |
| 47761 | Fan mode Monday | 1.0 |  |  |
| 47771 | activated | 0.0 |  |  |
| 47772 | system | 1.0 |  |  |
| 47773 | Start Sunday | 0.0 |  |  |
| 47774 | Start Saturday | 0.0 |  |  |
| 47775 | Start Friday | 0.0 |  |  |
| 47776 | Start Thursday | 0.0 |  |  |
| 47777 | Start Wednesday | 0.0 |  |  |
| 47778 | Start Tuesday | 0.0 |  |  |
| 47779 | Start Monday | 0.0 |  |  |
| 47781 | Finish Sunday | 0.0 |  |  |
| 47782 | Finish Saturday | 0.0 |  |  |
| 47783 | Finish Friday | 0.0 |  |  |
| 47784 | Finish Thursday | 0.0 |  |  |
| 47785 | Finish Wednesday | 0.0 |  |  |
| 47786 | Finish Tuesday | 0.0 |  |  |
| 47787 | Finish Monday | 0.0 |  |  |
| 47789 | Parallel offset Sunday | 0.0 |  |  |
| 47790 | Parallel offset Saturday | 0.0 |  |  |
| 47791 | Parallel offset Friday | 0.0 |  |  |
| 47792 | Parallel offset Thursday | 0.0 |  |  |
| 47793 | Parallel offset Wednesday | 0.0 |  |  |
| 47794 | Parallel offset Tuesday | 0.0 |  |  |
| 47795 | Parallel offset Monday | 0.0 |  |  |
| 47805 | activated | 0.0 |  |  |
| 47806 | system | 1.0 |  |  |
| 47807 | Start Sunday | 79200.0 |  |  |
| 47808 | Start Saturday | 79200.0 |  |  |
| 47809 | Start Friday | 79200.0 |  |  |
| 47810 | Start Thursday | 79200.0 |  |  |
| 47811 | Start Wednesday | 79200.0 |  |  |
| 47812 | Start Tuesday | 79200.0 |  |  |
| 47813 | Start Monday | 79200.0 |  |  |
| 47815 | Finish Sunday | 21600.0 |  |  |
| 47816 | Finish Saturday | 21600.0 |  |  |
| 47817 | Finish Friday | 21600.0 |  |  |
| 47818 | Finish Thursday | 21600.0 |  |  |
| 47819 | Finish Wednesday | 21600.0 |  |  |
| 47820 | Finish Tuesday | 21600.0 |  |  |
| 47821 | Finish Monday | 21600.0 |  |  |
| 47823 | Parallel offset Sunday | -1.0 |  |  |
| 47824 | Parallel offset Saturday | -1.0 |  |  |
| 47825 | Parallel offset Friday | -1.0 |  |  |
| 47826 | Parallel offset Thursday | -1.0 |  |  |
| 47827 | Parallel offset Wednesday | -1.0 |  |  |
| 47828 | Parallel offset Tuesday | -1.0 |  |  |
| 47829 | Parallel offset Monday | -1.0 |  |  |
| 47839 | activated | 0.0 |  |  |
| 47840 | system | 1.0 |  |  |
| 47841 | Start Sunday | 50400.0 |  |  |
| 47842 | Start Saturday | 50400.0 |  |  |
| 47843 | Start Friday | 50400.0 |  |  |
| 47844 | Start Thursday | 50400.0 |  |  |
| 47845 | Start Wednesday | 50400.0 |  |  |
| 47846 | Start Tuesday | 50400.0 |  |  |
| 47847 | Start Monday | 50400.0 |  |  |
| 47849 | Finish Sunday | 82800.0 |  |  |
| 47850 | Finish Saturday | 82800.0 |  |  |
| 47851 | Finish Friday | 82800.0 |  |  |
| 47852 | Finish Thursday | 82800.0 |  |  |
| 47853 | Finish Wednesday | 82800.0 |  |  |
| 47854 | Finish Tuesday | 82800.0 |  |  |
| 47855 | Finish Monday | 82800.0 |  |  |
| 47857 | Parallel offset Sunday | 1.0 |  |  |
| 47858 | Parallel offset Saturday | 1.0 |  |  |
| 47859 | Parallel offset Friday | 1.0 |  |  |
| 47860 | Parallel offset Thursday | 1.0 |  |  |
| 47861 | Parallel offset Wednesday | 1.0 |  |  |
| 47862 | Parallel offset Tuesday | 1.0 |  |  |
| 47863 | Parallel offset Monday | 1.0 |  |  |
| 47907 | activated | 0.0 |  |  |
| 47909 | Start Sunday | 0.0 |  |  |
| 47910 | Start Saturday | 0.0 |  |  |
| 47911 | Start Friday | 0.0 |  |  |
| 47912 | Start Thursday | 0.0 |  |  |
| 47913 | Start Wednesday | 0.0 |  |  |
| 47914 | Start Tuesday | 0.0 |  |  |
| 47915 | Start Monday | 0.0 |  |  |
| 47917 | Finish Sunday | 0.0 |  |  |
| 47918 | Finish Saturday | 0.0 |  |  |
| 47919 | Finish Friday | 0.0 |  |  |
| 47920 | Finish Thursday | 0.0 |  |  |
| 47921 | Finish Wednesday | 0.0 |  |  |
| 47922 | Finish Tuesday | 0.0 |  |  |
| 47923 | Finish Monday | 0.0 |  |  |
| 47925 | Sunday | 0.0 |  |  |
| 47926 | Saturday | 0.0 |  |  |
| 47927 | Friday | 0.0 |  |  |
| 47928 | Thursday | 0.0 |  |  |
| 47929 | Wednesday | 0.0 |  |  |
| 47930 | Tuesday | 0.0 |  |  |
| 47931 | Monday | 0.0 |  |  |
| 47941 | activated | 0.0 |  |  |
| 47943 | Start Sunday | 0.0 |  |  |
| 47944 | Start Saturday | 0.0 |  |  |
| 47945 | Start Friday | 0.0 |  |  |
| 47946 | Start Thursday | 0.0 |  |  |
| 47947 | Start Wednesday | 0.0 |  |  |
| 47948 | Start Tuesday | 0.0 |  |  |
| 47949 | Start Monday | 0.0 |  |  |
| 47951 | Finish Sunday | 0.0 |  |  |
| 47952 | Finish Saturday | 0.0 |  |  |
| 47953 | Finish Friday | 0.0 |  |  |
| 47954 | Finish Thursday | 0.0 |  |  |
| 47955 | Finish Wednesday | 0.0 |  |  |
| 47956 | Finish Tuesday | 0.0 |  |  |
| 47957 | Finish Monday | 0.0 |  |  |
| 47959 | Sunday | 0.0 |  |  |
| 47960 | Saturday | 0.0 |  |  |
| 47961 | Friday | 0.0 |  |  |
| 47962 | Thursday | 0.0 |  |  |
| 47963 | Wednesday | 0.0 |  |  |
| 47964 | Tuesday | 0.0 |  |  |
| 47965 | Monday | 0.0 |  |  |
| 47975 | activated | 0.0 |  |  |
| 47977 | Start Sunday | 0.0 |  |  |
| 47978 | Start Saturday | 0.0 |  |  |
| 47979 | Start Friday | 0.0 |  |  |
| 47980 | Start Thursday | 0.0 |  |  |
| 47981 | Start Wednesday | 0.0 |  |  |
| 47982 | Start Tuesday | 0.0 |  |  |
| 47983 | Start Monday | 0.0 |  |  |
| 47985 | Finish Sunday | 0.0 |  |  |
| 47986 | Finish Saturday | 0.0 |  |  |
| 47987 | Finish Friday | 0.0 |  |  |
| 47988 | Finish Thursday | 0.0 |  |  |
| 47989 | Finish Wednesday | 0.0 |  |  |
| 47990 | Finish Tuesday | 0.0 |  |  |
| 47991 | Finish Monday | 0.0 |  |  |
| 47993 | Blocking Sunday | 2.0 |  |  |
| 47994 | Blocking Saturday | 2.0 |  |  |
| 47995 | Blocking Friday | 2.0 |  |  |
| 47996 | Blocking Thursday | 2.0 |  |  |
| 47997 | Blocking Wednesday | 2.0 |  |  |
| 47998 | Blocking Tuesday | 2.0 |  |  |
| 47999 | Blocking Monday | 2.0 |  |  |
| 48009 | activated | 0.0 |  |  |
| 48011 | Start Sunday | 0.0 |  |  |
| 48012 | Start Saturday | 0.0 |  |  |
| 48013 | Start Friday | 0.0 |  |  |
| 48014 | Start Thursday | 0.0 |  |  |
| 48015 | Start Wednesday | 0.0 |  |  |
| 48016 | Start Tuesday | 0.0 |  |  |
| 48017 | Start Monday | 0.0 |  |  |
| 48019 | Finish Sunday | 0.0 |  |  |
| 48020 | Finish Saturday | 0.0 |  |  |
| 48021 | Finish Friday | 0.0 |  |  |
| 48022 | Finish Thursday | 0.0 |  |  |
| 48023 | Finish Wednesday | 0.0 |  |  |
| 48024 | Finish Tuesday | 0.0 |  |  |
| 48025 | Finish Monday | 0.0 |  |  |
| 48027 | Blocking Sunday | 2.0 |  |  |
| 48028 | Blocking Saturday | 2.0 |  |  |
| 48029 | Blocking Friday | 2.0 |  |  |
| 48030 | Blocking Thursday | 2.0 |  |  |
| 48031 | Blocking Wednesday | 2.0 |  |  |
| 48032 | Blocking Tuesday | 2.0 |  |  |
| 48033 | Blocking Monday | 2.0 |  |  |
| 48072 | start diff additional heat | 700.0 DM | start_additional_heat (wyłączony) |  |
| 48132 | Hot water boost | 0.0 | hot_water_boost | Hot water boost: 1 przy tymczasowym luksusie |
| 48200 | freeze protection | 0.0 |  |  |
| 48228 | heating | 0.0 |  |  |
| 48229 | heating | 0.0 |  |  |
| 48230 | heating | 0.0 |  |  |
| 48231 | heating | 0.0 |  |  |
| 48232 | heating | 0.0 |  |  |
| 48233 | heating | 0.0 |  |  |
| 48234 | heating | 0.0 |  |  |
| 48235 | heating | 1.0 |  |  |
| 48239 | cooling permitted | 0.0 |  |  |
| 48240 | cooling permitted | 0.0 |  |  |
| 48241 | cooling permitted | 0.0 |  |  |
| 48242 | cooling permitted | 0.0 |  |  |
| 48243 | cooling permitted | 0.0 |  |  |
| 48244 | cooling permitted | 0.0 |  |  |
| 48245 | cooling permitted | 0.0 |  |  |
| 48246 | cooling permitted | 0.0 |  |  |
| 48356 | silent mode permitted | 0.0 |  |  |
| 48357 | silent mode permitted | 0.0 |  |  |
| 48358 | silent mode permitted | 0.0 |  |  |
| 48359 | silent mode permitted | 0.0 |  |  |
| 48360 | silent mode permitted | 0.0 |  |  |
| 48361 | silent mode permitted | 0.0 |  |  |
| 48362 | silent mode permitted | 0.0 |  |  |
| 48363 | silent mode permitted | 0.0 |  |  |
| 48375 | heating | 1.0 |  |  |
| 48376 | heating | 1.0 |  |  |
| 48377 | heating | 1.0 |  |  |
| 48378 | heating | 1.0 |  |  |
| 48379 | heating | 1.0 |  |  |
| 48380 | heating | 1.0 |  |  |
| 48381 | heating | 1.0 |  |  |
| 48382 | heating | 1.0 |  |  |
| 48391 | hot water | 1.0 |  |  |
| 48392 | hot water | 1.0 |  |  |
| 48393 | hot water | 1.0 |  |  |
| 48394 | hot water | 1.0 |  |  |
| 48395 | hot water | 1.0 |  |  |
| 48396 | hot water | 1.0 |  |  |
| 48397 | hot water | 1.0 |  |  |
| 48398 | hot water | 1.0 |  |  |
| 48440 | speed in wait mode | 15.0 % |  |  |
| 48442 | activated | 0.0 |  |  |
| 48460 | max. allowed speed | 100.0 % |  |  |
| 48461 | max. allowed speed | 100.0 % |  |  |
| 48462 | max. allowed speed | 100.0 % |  |  |
| 48463 | max. allowed speed | 100.0 % |  |  |
| 48464 | max. allowed speed | 100.0 % |  |  |
| 48465 | max. allowed speed | 100.0 % |  |  |
| 48466 | max. allowed speed | 100.0 % |  |  |
| 48467 | max. allowed speed | 100.0 % |  |  |
| 48642 | start delta-T | 20.0 °C |  |  |
| 48643 | stop delta-T | 10.0 °C |  |  |
| 48644 | max. tank temperature | 85.0 °C |  |  |
| 48645 | tank cooling | 0.0 |  |  |
| 48650 | compressor phase | 0.0 |  |  |
| 48651 | compressor phase | 0.0 |  |  |
| 48652 | compressor phase | 0.0 |  |  |
| 48653 | compressor phase | 0.0 |  |  |
| 48654 | compressor phase | 0.0 |  |  |
| 48655 | compressor phase | 0.0 |  |  |
| 48656 | compressor phase | 0.0 |  |  |
| 48657 | compressor phase | 0.0 |  |  |
| 48659 | blockFreq | 0.0 |  |  |
| 48660 | blockFreq | 0.0 |  |  |
| 48665 | Blocked frequency 2 | 0.0 |  |  |
| 48711 | stop temp compressor | -25.0 °C |  |  |
| 48712 | stop temp compressor | -25.0 °C |  |  |
| 48713 | stop temp compressor | -25.0 °C |  |  |
| 48714 | stop temp compressor | -25.0 °C |  |  |
| 48715 | stop temp compressor | -25.0 °C |  |  |
| 48716 | stop temp compressor | -25.0 °C |  |  |
| 48717 | stop temp compressor | -25.0 °C |  |  |
| 48718 | stop temp compressor | -20.0 °C |  |  |
| 48826 | limit RH in the room, syst. | 0.0 |  |  |
| 48830 | current limiting | 0.0 |  |  |
| 48831 | current limiting | 0.0 |  |  |
| 48832 | current limiting | 0.0 |  |  |
| 48833 | current limiting | 0.0 |  |  |
| 48834 | current limiting | 0.0 |  |  |
| 48835 | current limiting | 0.0 |  |  |
| 48836 | current limiting | 0.0 |  |  |
| 48837 | current limiting | 0.0 |  |  |
| 48891 | adjusting ventilation | 0.0 |  |  |
| 49190 | Alarm at min temp | 0.0 |  |  |
| 49288 | set mode | 3.0 |  |  |
| 49397 | Blocked frequency 1 | 0.0 |  |  |
| 49563 | QM41 motion interval | 14.0 days |  |  |
| 49564 | fire alarm temperature BT20 | 38.0 °C |  |  |
| 49566 | set point value BP12 | 150.0 Pa |  |  |
| 49567 | min. fan speed GQ2 | 10.0 % |  |  |
| 49568 | max. fan speed GQ2 | 100.0 % |  |  |
| 49569 | filt. alarm press. | 150.0 Pa |  |  |
| 49570 | months btwn filter alarms | 12.0 |  |  |
| 49571 | runtime damper QM41 | 150.0 sec |  |  |
| 49572 | outd temp compensation | 0.0 Pa |  |  |
| 49573 | type of fire alarm | 1.0 |  |  |
| 49574 | fan speed during fire alarm | 70.0 % |  |  |
| 49580 | start manual motion QM41 | 0.0 |  |  |
| 49584 | kc parameter | 0.1 |  |  |
| 49610 | climate system | 0.0 |  |  |
| 49728 | man. sel. power at DOT | 0.0 |  |  |
| 49740 | start manual defrosting | 0.0 |  |  |
| 49741 | start manual defrosting | 0.0 |  |  |
| 49742 | start manual defrosting | 0.0 |  |  |
| 49743 | start manual defrosting | 0.0 |  |  |
| 49744 | start manual defrosting | 0.0 |  |  |
| 49745 | start manual defrosting | 0.0 |  |  |
| 49746 | start manual defrosting | 0.0 |  |  |
| 49797 | temp. cond. heater EB14 | 4.0 °C |  |  |
| 49866 | min. allowed speed | 1.0 % |  |  |
| 49867 | min. allowed speed | 1.0 % |  |  |
| 49868 | min. allowed speed | 1.0 % |  |  |
| 49869 | min. allowed speed | 1.0 % |  |  |
| 49870 | min. allowed speed | 1.0 % |  |  |
| 49871 | min. allowed speed | 1.0 % |  |  |
| 49872 | min. allowed speed | 1.0 % |  |  |
| 49873 | min. allowed speed | 15.0 % |  |  |
| 49909 | start time | 16.0 | hot_water_boost_start_time (wyłączony) |  |
| 49910 | activated | 0.0 |  |  |
| 49912 | Start Sunday | 0.0 |  |  |
| 49913 | Start Saturday | 0.0 |  |  |
| 49914 | Start Friday | 0.0 |  |  |
| 49915 | Start Thursday | 0.0 |  |  |
| 49916 | Start Wednesday | 0.0 |  |  |
| 49917 | Start Tuesday | 0.0 |  |  |
| 49918 | Start Monday | 0.0 |  |  |
| 49920 | Finish Sunday | 0.0 |  |  |
| 49921 | Finish Saturday | 0.0 |  |  |
| 49922 | Finish Friday | 0.0 |  |  |
| 49923 | Finish Thursday | 0.0 |  |  |
| 49924 | Finish Wednesday | 0.0 |  |  |
| 49925 | Finish Tuesday | 0.0 |  |  |
| 49926 | Finish Monday | 0.0 |  |  |
| 49928 | Silent mode Sunday | 2.0 |  |  |
| 49929 | Silent mode Saturday | 2.0 |  |  |
| 49930 | Silent mode Friday | 2.0 |  |  |
| 49931 | Silent mode Thursday | 2.0 |  |  |
| 49932 | Silent mode Wednesday | 2.0 |  |  |
| 49933 | Silent mode Tuesday | 2.0 |  |  |
| 49934 | Silent mode Monday | 2.0 |  |  |
| 49944 | activated | 0.0 |  |  |
| 49946 | Start Sunday | 0.0 |  |  |
| 49947 | Start Saturday | 0.0 |  |  |
| 49948 | Start Friday | 0.0 |  |  |
| 49949 | Start Thursday | 0.0 |  |  |
| 49950 | Start Wednesday | 0.0 |  |  |
| 49951 | Start Tuesday | 0.0 |  |  |
| 49952 | Start Monday | 0.0 |  |  |
| 49954 | Finish Sunday | 0.0 |  |  |
| 49955 | Finish Saturday | 0.0 |  |  |
| 49956 | Finish Friday | 0.0 |  |  |
| 49957 | Finish Thursday | 0.0 |  |  |
| 49958 | Finish Wednesday | 0.0 |  |  |
| 49959 | Finish Tuesday | 0.0 |  |  |
| 49960 | Finish Monday | 0.0 |  |  |
| 49962 | Silent mode Sunday | 1.0 |  |  |
| 49963 | Silent mode Saturday | 1.0 |  |  |
| 49964 | Silent mode Friday | 1.0 |  |  |
| 49965 | Silent mode Thursday | 1.0 |  |  |
| 49966 | Silent mode Wednesday | 1.0 |  |  |
| 49967 | Silent mode Tuesday | 1.0 |  |  |
| 49968 | Silent mode Monday | 1.0 |  |  |
| 49992 | Pump: Heating medium (GP6) | 0.0 |  |  |
| 49993 | Int elec add heat | 4.0 |  |  |
| 49994 | Priority | 30.0 | priority | Priority: 10=bezczynność, 20=CWU, 30=CO (potwierdzone skanami); używane do rozróżnienia CO/CWU |
| 49995 | Pump: Heating medium (EB100-GP1) | 1.0 |  |  |
| 50004 | Temporary lux | 0.0 | temp_lux | Temporary lux: nie zmienia się przy tymczasowym luksusie, nie używać |
| 50096 | status: | 15005.0 min |  |  |
| 50113 | status: | 1512.0 kW |  |  |
| 50122 | Part no. | 0.0 |  |  |
| 50130 | Serial number | 0.0 |  |  |
| 50249 | Next periodic increase: 03 . 11 . 2 | 3.0 |  |  |
| 50312 | Heat capacity (EB101) | 2.5 kW |  |  |
| 50320 | Smart Control | 0.0 |  |  |
| 50321 | 1 year’s consumption | 2066.0 kWh |  |  |
| 50322 | 1 year’s production | 7116.0 kWh |  |  |
| 50323 | 10 years’ consumption | 2070.0 kWh |  |  |
| 50324 | 10 years’ production | 7120.0 kWh |  |  |
| 50325 | Hot water temp. | 42.0 °C |  |  |
| 50345 | Hot water amount | 10.0 min |  |  |
| 50349 | Block 1 | 0.0 |  |  |
| 50357 | Block 2 | 145.0 |  |  |
| 50365 | Block 3 | 6.0 |  |  |
| 65535 | Text not found: id[], fw[nibe-e9], | 0.0 |  |  |
| 43109 | (usunięty z API) | | current_hot_water_mode | Current hot water mode: usunięty z API |
| 40145 | (usunięty z API) | | oil_temp_ep15 | Oil temperature EP15-BT29: usunięty z API |
