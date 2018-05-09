$(document).ready(function() {
    //var doc_height = $(window).height();
    //$('body').css('height',doc_height);
    var loader = $('.loader-bg'),
        grid = $('.scheds-grid'),
        bar,
        cur_mall,
        loader_mode = false,
        init_cancel = false;

    // JSON to CSV Converter
    var ConvertToCSV = function(objArray) {
        var array = typeof objArray != 'object' ? JSON.parse(objArray) : objArray;
        var str = '';

        for (var i = 0; i < array.length; i++) {
            var row = [];
            row.push(array[i][0]);
            row.push(array[i][1]);
            row.push(array[i][2]);
            row.push(array[i][3] + ' ' + array[i][4]);
            row.push(array[i][5]);
            row.push(array[i][6]);

            str += row.join(',') + '\r\n';
        }

        return str;
    }


    var isEmpty = function(obj) {
        console.log(typeof obj + " Checking object is empty...");
        for (var prop in obj) {
            if (obj.hasOwnProperty(prop))
                console.log("nah...");
            return false;
        }
        console.log("duh..");
        return true;
    }

    $('.list-item').on('mouseenter', function() {
        if (loader_mode == false) {
            $(this).find('.theater-code').css({
                'color': 'orange'
            });
        }
    });

    $('.list-item').on('mouseleave', function() {
        $(this).find('.theater-code').css({
            'color': '#ffffff'
        });
    });

    $('.theater-code').on('click', function() {
        var tcode = $(this).text();
        var theater = $(this).parent().text().replace(/\sC\s/gi, '');
        console.log("Code: " + tcode + " Theater: " + theater);
        showModal(tcode, theater);
    });

    $('.ctc').on('click', function() {
        var tcode = $(this).data("ctc");
        var theater = $(this).parent().text().replace(/\sC\s/gi, '');
        console.log("Parsing from Click the City -- Code: " + tcode + " Theater: " + theater);
        showModal(tcode, theater, "CTC");
    });

    $(document).on('click', '#btnOk', function() {
        console.log("Arghh...");
        hideLoader();
    });

    function showModal(item, theater, mode) {
        var mode = typeof mode !== 'undefined' ? mode : 'origin';
        console.log('show: ' + item + ' mode: ' + mode);
        init();
        var tcode = item;
        cur_mall = tcode;
        hideGrid();
        showLoader();
        $('.loader-modal .mall-name').html(item);

        $.ajax({
            url: '/fetch/' + tcode + '/' + mode,
            type: 'GET',
            dataType: 'json',
            success: function(data) {
                console.log(data.length);
                if (data.length) {
                    console.log("successfully fetched movies for " + tcode);
                    hideLoader();
                    showGrid(data, theater)
                } else {
                    barError("Empty result!");
                }
            }

        });
    }

    function exportToCSV(data) {
        var csv = ConvertToCSV(data);
        // Data URI
        var csvData = 'data:application/csv;charset=utf-8,' + encodeURIComponent(csv);

        return csvData;
    }

    function showGrid(data, theater) {
        grid.removeClass('invi');
        console.log("Fetching data:" + JSON.stringify(data));

        var obj = {
            flexWidth: true,
            flexHeight: true,
            //title: "Movie Schedules in " + theater,
            resizable: false,
            draggable: false,
            topVisible: false,
            bottomVisible: false,
            roundCorners: false,
            numberCell: false,
            scrollModel: false
        };
        obj.colModel = [{
            title: "Title",
            width: 200,
            dataType: "string",
            align: "left"
        }, {
            title: "Code",
            width: 80,
            dataType: "string",
            align: "left"
        }, {
            title: "Cinema",
            width: 80,
            dataType: "string",
            align: "right"

        }, {
            title: "Date",
            width: 80,
            dataType: "date",
            align: "right"
        }, {
            title: "Time Start",
            width: 100,
            dataType: "string",
            align: "right"
        }, {
            title: "Price",
            width: 100,
            dataType: "float",
            align: "right"
        }, {
            title: "Variant",
            width: 50,
            dataType: "string",
            align: "left"
        }];
        obj.dataModel = {
            data: data
        };

        grid.dialog({
            height: 600,
            width: 700,
            position: ['top', 46],

            title: "Movie Schedules in " + theater,


            open: function(evt, ui) {
                var $grid = $("#schedules_grid");
                var ht = $grid.parent().height() - 2;
                var wd = $grid.parent().width() - 2;
                //alert("ht=" + ht + ", wd=" + wd);                        
                if ($grid.hasClass('pq-grid')) {
                    $grid.pqGrid("option", {
                        height: ht,
                        width: wd
                    });
                } else {
                    obj.width = wd;
                    obj.height = ht;
                    $grid.pqGrid(obj);
                }

                //grid events
                $grid.on("pqgridcelleditkeydown", function(evt, ui) {
                    //debugger;
                    var keyCode = evt.keyCode,
                        rowIndxPage = ui.rowIndxPage,
                        colIndx = ui.colIndx;

                    if (keyCode == 40 || keyCode == 38) {
                        $grid.pqGrid("saveEditCell");
                    }

                    if (keyCode == 40) {
                        if (rowIndxPage >= data.length - 1) {
                            //var dt = $grid.pqGrid("getEditCellData");
                            var dt = ui.$cell.text();
                            if (dt.length > 0) {
                                //alert(dt);
                                var row = ["", "", "", ""];
                                data.push(row);
                                $grid.pqGrid("refreshDataAndView");
                            }
                        }
                        if (rowIndxPage < data.length - 1) {
                            //debugger;
                            rowIndxPage++;
                            $grid.pqGrid("setSelection", null);
                            $grid.pqGrid("setSelection", {
                                rowIndx: rowIndxPage
                            });
                            $grid.pqGrid("editCell", {
                                rowIndxPage: rowIndxPage,
                                colIndx: colIndx
                            });
                            evt.preventDefault();
                            return false;
                        }
                    } else if (keyCode == 38 && rowIndxPage > 0) {
                        rowIndxPage--;
                        $grid.pqGrid("setSelection", null);
                        $grid.pqGrid("setSelection", {
                            rowIndx: rowIndxPage
                        });

                        $grid.pqGrid("editCell", {
                            rowIndxPage: rowIndxPage,
                            colIndx: colIndx
                        });
                        evt.preventDefault();
                        return false;
                    }
                });

                $grid.on("keydown", function(evt) {
                    var keyCode = evt.keyCode;
                    if (keyCode == 38 || keyCode == 40) {
                        evt.preventDefault();
                        return false;
                    }
                });
            }, // end open

            close: function() {
                var $grid = $("#schedules_grid");
                $grid.pqGrid("destroy");
            },

            show: {
                effect: "blind",
                duration: 500
            },

            hide: {
                effect: "clip",
                duration: 500
            },

            resizeStop: function(evt, ui) {
                var $grid = $("#schedules_grid");
                var ht = $grid.parent().height();
                var wd = $grid.parent().width();
                $grid.pqGrid("option", {
                    height: ht - 2,
                    width: wd - 2
                });
            },

            buttons: [
            {
                text: "Download CSV",
                id: "download-csv",
                class: "ui-button ui-widget ui-state-default",
                style: "top: 12px;",

                click: function () {
                        var dataModel = $("#schedules_grid").pqGrid("option", "dataModel");
                        var aLink = document.createElement('a');
                        aLink.href = '/download-csv?payload=' + encodeURIComponent(JSON.stringify(dataModel.data));
                        //aLink.download = 'export.csv';
                        document.body.appendChild(aLink);
                        aLink.click();
                        document.body.removeChild(aLink);
                }
            },
            {
                text: "Send to Backend",
                id: "send-to-backend",
                class: "ui-button ui-widget ui-state-default",
                style: "top: 12px;",

                click: function() {
                    var dataModel = $("#schedules_grid").pqGrid("option", "dataModel");
                    $.ajax({
                        'type': 'POST',
                        'url': 'http://54.254.238.125/endpoints/scrape/getScheds/',
                        'dataType': 'json',
                        'data': JSON.stringify(dataModel.data),
                        'success': function(res) {
                            console.log(res);
                        }
                    });
                }
            } 
            ]

        });
    }

    function barError(msg) {
        msg = (msg !== "") ? msg : "Error!!!";
        $('.loader-modal p').html(msg).addClass('error-bar').css('width', '200px');
        $('.loader-modal').append("<div class='btn-grp'><button id='btnOk' class='btn btn-cancel en-btn'>OK</button></div>");
    }

    function showLoader() {
        loader.removeClass('invi');
        loader_mode = true;
    }


    function hideLoader() {
        loader.addClass('invi');
        loader.find(".btn-grp").empty();
        loader_mode = false;
    }

    function hideGrid() {
        grid.addClass('invi');
    }

    function init() {
        $('.loader-modal p').html('Fetching data...');
    }

    //call functions
    init();
});

function trim11(str) {
    str = str.replace(/^\s+/, '');
    for (var i = str.length - 1; i >= 0; i--) {
        if (/\S/.test(str.charAt(i))) {
            str = str.substring(0, i + 1);
            break;
        }
    }
    return str;
}

var idSplitter = function(cl_id) {
    var id_before = "",
        id_split = "",
        id_result = "";

    id_before = cl_id;
    id_split = id_before.split("_");
    id_result = id_split[id_split.length - 1];
    return id_result;
}
